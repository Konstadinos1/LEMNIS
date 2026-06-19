/**
 * Signal Double Ratchet Algorithm
 * Spec: https://signal.org/docs/specifications/doubleratchet/
 *
 * KDF_RK  : HKDF-SHA-256(rk, dh_out, "WhisperRatchet") → (rk', ck)
 * KDF_CK  : HMAC-SHA-256(ck, 0x01) → mk  |  HMAC-SHA-256(ck, 0x02) → ck'
 * ENCRYPT : AES-256-GCM with per-message keys derived from mk via HKDF
 *
 * All operations are async to allow the Rust native module (conduit-crypto)
 * to run them off the JS thread in the Secure Enclave / StrongBox context.
 */

import {
  hkdfAsync,
  hmacSha256Async,
  aesGcmEncryptAsync,
  aesGcmDecryptAsync,
  x25519DhAsync,
  x25519KeyPairAsync,
  toBase64,
  fromBase64,
  concat,
  type X25519KeyPair,
  type AesGcmCiphertext,
} from './primitives';

const MAX_SKIP = 1000;
const INFO_RATCHET  = 'WhisperRatchet';
const INFO_MSG_KEYS = 'WhisperMessageKeys';
const ZERO_SALT = new Uint8Array(32);

// ─── Types ────────────────────────────────────────────────────────────────────

export interface MessageHeader {
  dh: Uint8Array;   // sender's current DH public key
  pn: number;       // previous chain length
  n:  number;       // message number in current chain
}

export interface EncryptedMessage {
  header:     MessageHeader;
  ciphertext: AesGcmCiphertext;
}

interface MsgKeyEntry {
  messageKey: Uint8Array;
}

export interface RatchetState {
  RK:        Uint8Array;
  CKs:       Uint8Array | null;
  Ns:        number;
  CKr:       Uint8Array | null;
  Nr:        number;
  DHs:       X25519KeyPair;
  DHr:       Uint8Array | null;
  PN:        number;
  MKSKIPPED: Record<string, MsgKeyEntry>;
}

// ─── KDF helpers ─────────────────────────────────────────────────────────────

async function kdfRK(rk: Uint8Array, dhOut: Uint8Array): Promise<[Uint8Array, Uint8Array]> {
  const out = await hkdfAsync(dhOut, 64, rk, INFO_RATCHET);
  return [out.slice(0, 32), out.slice(32, 64)];
}

async function kdfCK(ck: Uint8Array): Promise<[Uint8Array, Uint8Array]> {
  const [mk, ckNext] = await Promise.all([
    hmacSha256Async(ck, new Uint8Array([0x01])),
    hmacSha256Async(ck, new Uint8Array([0x02])),
  ]);
  return [ckNext, mk];
}

async function deriveMessageKeys(mk: Uint8Array): Promise<{ encKey: Uint8Array; iv: Uint8Array }> {
  const out = await hkdfAsync(mk, 80, ZERO_SALT, INFO_MSG_KEYS);
  return { encKey: out.slice(0, 32), iv: out.slice(64, 80) };
}

// ─── Initialisation ───────────────────────────────────────────────────────────

/** Initialise a ratchet for the session INITIATOR (Alice). */
export async function ratchetInitAlice(
  sharedSecret: Uint8Array,
  bobDhPubKey: Uint8Array,
): Promise<RatchetState> {
  const DHs = await x25519KeyPairAsync();
  const dh = await x25519DhAsync(DHs.secretKey, bobDhPubKey);
  const [RK, CKs] = await kdfRK(sharedSecret, dh);

  return { RK, CKs, Ns: 0, CKr: null, Nr: 0, DHs, DHr: bobDhPubKey, PN: 0, MKSKIPPED: {} };
}

/** Initialise a ratchet for the session RESPONDER (Bob). No crypto ops needed. */
export function ratchetInitBob(
  sharedSecret: Uint8Array,
  bobDhKeyPair: X25519KeyPair,
): RatchetState {
  return { RK: sharedSecret, CKs: null, Ns: 0, CKr: null, Nr: 0, DHs: bobDhKeyPair, DHr: null, PN: 0, MKSKIPPED: {} };
}

// ─── Encrypt ─────────────────────────────────────────────────────────────────

export async function ratchetEncrypt(
  state: RatchetState,
  plaintext: Uint8Array,
  associatedData: Uint8Array,
): Promise<{ state: RatchetState; message: EncryptedMessage }> {
  if (!state.CKs) throw new Error('Sending chain not initialised');

  const [CKs, mk] = await kdfCK(state.CKs);
  const { encKey } = await deriveMessageKeys(mk);

  const header: MessageHeader = { dh: state.DHs.publicKey, pn: state.PN, n: state.Ns };
  const ad = concat(associatedData, encodeHeader(header));
  const ciphertext = await aesGcmEncryptAsync(encKey, plaintext, ad);

  return {
    state: { ...state, CKs, Ns: state.Ns + 1 },
    message: { header, ciphertext },
  };
}

// ─── Decrypt ─────────────────────────────────────────────────────────────────

export async function ratchetDecrypt(
  state: RatchetState,
  message: EncryptedMessage,
  associatedData: Uint8Array,
): Promise<{ state: RatchetState; plaintext: Uint8Array }> {
  // Try skipped message keys first
  const skipKey = `${toBase64(message.header.dh)}:${message.header.n}`;
  if (state.MKSKIPPED[skipKey]) {
    const mk = state.MKSKIPPED[skipKey].messageKey;
    const { encKey } = await deriveMessageKeys(mk);
    const ad = concat(associatedData, encodeHeader(message.header));
    const plaintext = await aesGcmDecryptAsync(encKey, message.ciphertext, ad);
    const MKSKIPPED = { ...state.MKSKIPPED };
    delete MKSKIPPED[skipKey];
    return { state: { ...state, MKSKIPPED }, plaintext };
  }

  let s = state;

  // DH ratchet step if we see a new remote DH key
  if (!s.DHr || toBase64(message.header.dh) !== toBase64(s.DHr)) {
    s = await skipMessageKeys(s, message.header.pn);
    s = await dhRatchetStep(s, message.header.dh);
  }

  s = await skipMessageKeys(s, message.header.n);

  const [CKr, mk] = await kdfCK(s.CKr!);
  const { encKey } = await deriveMessageKeys(mk);
  const ad = concat(associatedData, encodeHeader(message.header));
  const plaintext = await aesGcmDecryptAsync(encKey, message.ciphertext, ad);

  return { state: { ...s, CKr, Nr: s.Nr + 1 }, plaintext };
}

// ─── DH ratchet step ──────────────────────────────────────────────────────────

async function dhRatchetStep(state: RatchetState, remoteDH: Uint8Array): Promise<RatchetState> {
  const PN = state.Ns;
  const dh1 = await x25519DhAsync(state.DHs.secretKey, remoteDH);
  const [RK1, CKr] = await kdfRK(state.RK, dh1);
  const DHs = await x25519KeyPairAsync();
  const dh2 = await x25519DhAsync(DHs.secretKey, remoteDH);
  const [RK, CKs] = await kdfRK(RK1, dh2);

  return { ...state, RK, CKs, Ns: 0, CKr, Nr: 0, DHs, DHr: remoteDH, PN };
}

async function skipMessageKeys(state: RatchetState, until: number): Promise<RatchetState> {
  if (state.Nr + MAX_SKIP < until) throw new Error('Too many skipped messages');
  if (!state.CKr) return state;

  let s = state;
  while (s.Nr < until) {
    const [CKr, mk] = await kdfCK(s.CKr!);
    const key = `${toBase64(s.DHr!)}:${s.Nr}`;
    s = { ...s, CKr, Nr: s.Nr + 1, MKSKIPPED: { ...s.MKSKIPPED, [key]: { messageKey: mk } } };
  }
  return s;
}

// ─── Header serialisation ────────────────────────────────────────────────────

function encodeHeader(h: MessageHeader): Uint8Array {
  const pnBuf = new Uint8Array(4);
  const nBuf  = new Uint8Array(4);
  new DataView(pnBuf.buffer).setUint32(0, h.pn);
  new DataView(nBuf.buffer).setUint32(0, h.n);
  return concat(h.dh, pnBuf, nBuf);
}

export function serializeState(state: RatchetState): string {
  return JSON.stringify({
    RK:  toBase64(state.RK),
    CKs: state.CKs ? toBase64(state.CKs) : null,
    Ns:  state.Ns,
    CKr: state.CKr ? toBase64(state.CKr) : null,
    Nr:  state.Nr,
    DHs: { publicKey: toBase64(state.DHs.publicKey), secretKey: toBase64(state.DHs.secretKey) },
    DHr: state.DHr ? toBase64(state.DHr) : null,
    PN:  state.PN,
    MKSKIPPED: Object.fromEntries(
      Object.entries(state.MKSKIPPED).map(([k, v]) => [k, toBase64(v.messageKey)])
    ),
  });
}

export function deserializeState(raw: string): RatchetState {
  const d = JSON.parse(raw);
  return {
    RK:  fromBase64(d.RK),
    CKs: d.CKs ? fromBase64(d.CKs) : null,
    Ns:  d.Ns,
    CKr: d.CKr ? fromBase64(d.CKr) : null,
    Nr:  d.Nr,
    DHs: { publicKey: fromBase64(d.DHs.publicKey), secretKey: fromBase64(d.DHs.secretKey) },
    DHr: d.DHr ? fromBase64(d.DHr) : null,
    PN:  d.PN,
    MKSKIPPED: Object.fromEntries(
      Object.entries(d.MKSKIPPED as Record<string, string>).map(([k, v]) => [
        k, { messageKey: fromBase64(v) },
      ])
    ),
  };
}
