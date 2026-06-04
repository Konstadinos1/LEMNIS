/**
 * Signal Double Ratchet Algorithm
 * Spec: https://signal.org/docs/specifications/doubleratchet/
 *
 * KDF_RK  : HKDF-SHA-256(rk, dh_out, "WhisperRatchet") → (rk', ck)
 * KDF_CK  : HMAC-SHA-256(ck, 0x01) → mk  |  HMAC-SHA-256(ck, 0x02) → ck'
 * ENCRYPT : AES-256-GCM with per-message keys derived from mk via HKDF
 */

import {
  hkdf,
  hmacSha256,
  aesGcmEncrypt,
  aesGcmDecrypt,
  x25519Dh,
  x25519KeyPair,
  toBase64,
  fromBase64,
  concat,
  type X25519KeyPair,
  type AesGcmCiphertext,
} from './primitives';

const MAX_SKIP = 1000;
const INFO_RATCHET = 'WhisperRatchet';
const INFO_MSG_KEYS = 'WhisperMessageKeys';
const ZERO_SALT = new Uint8Array(32);

// ─── Types ────────────────────────────────────────────────────────────────────

export interface MessageHeader {
  dh: Uint8Array;   // sender's current DH public key
  pn: number;       // previous chain length
  n: number;        // message number in current chain
}

export interface EncryptedMessage {
  header: MessageHeader;
  ciphertext: AesGcmCiphertext;
}

interface MsgKeyEntry {
  messageKey: Uint8Array;
}

export interface RatchetState {
  // Root key
  RK: Uint8Array;

  // Sending chain
  CKs: Uint8Array | null;
  Ns: number;

  // Receiving chain
  CKr: Uint8Array | null;
  Nr: number;

  // DH ratchet key pair (sender side)
  DHs: X25519KeyPair;

  // Remote DH public key (last seen)
  DHr: Uint8Array | null;

  // Previous sending chain length
  PN: number;

  // Skipped message keys: key = `${b64(dh_pub)}:${n}`
  MKSKIPPED: Record<string, MsgKeyEntry>;
}

// ─── KDF helpers ─────────────────────────────────────────────────────────────

function kdfRK(rk: Uint8Array, dhOut: Uint8Array): [Uint8Array, Uint8Array] {
  const out = hkdf(dhOut, 64, rk, INFO_RATCHET);
  return [out.slice(0, 32), out.slice(32, 64)];
}

function kdfCK(ck: Uint8Array): [Uint8Array, Uint8Array] {
  const mk = hmacSha256(ck, new Uint8Array([0x01]));
  const ckNext = hmacSha256(ck, new Uint8Array([0x02]));
  return [ckNext, mk];
}

function deriveMessageKeys(mk: Uint8Array): { encKey: Uint8Array; macKey: Uint8Array; iv: Uint8Array } {
  const out = hkdf(mk, 80, ZERO_SALT, INFO_MSG_KEYS);
  return {
    encKey: out.slice(0, 32),
    macKey: out.slice(32, 64),
    iv: out.slice(64, 80),
  };
}

// ─── Initialisation ───────────────────────────────────────────────────────────

/** Initialise a ratchet for the session INITIATOR (Alice). */
export function ratchetInitAlice(
  sharedSecret: Uint8Array,   // from X3DH
  bobDhPubKey: Uint8Array
): RatchetState {
  const DHs = x25519KeyPair();
  const dh = x25519Dh(DHs.secretKey, bobDhPubKey);
  const [RK, CKs] = kdfRK(sharedSecret, dh);

  return {
    RK,
    CKs,
    Ns: 0,
    CKr: null,
    Nr: 0,
    DHs,
    DHr: bobDhPubKey,
    PN: 0,
    MKSKIPPED: {},
  };
}

/** Initialise a ratchet for the session RESPONDER (Bob). */
export function ratchetInitBob(
  sharedSecret: Uint8Array,
  bobDhKeyPair: X25519KeyPair
): RatchetState {
  return {
    RK: sharedSecret,
    CKs: null,
    Ns: 0,
    CKr: null,
    Nr: 0,
    DHs: bobDhKeyPair,
    DHr: null,
    PN: 0,
    MKSKIPPED: {},
  };
}

// ─── Encrypt ─────────────────────────────────────────────────────────────────

export function ratchetEncrypt(
  state: RatchetState,
  plaintext: Uint8Array,
  associatedData: Uint8Array
): { state: RatchetState; message: EncryptedMessage } {
  if (!state.CKs) throw new Error('Sending chain not initialised');

  const [CKs, mk] = kdfCK(state.CKs);
  const { encKey } = deriveMessageKeys(mk);

  const header: MessageHeader = {
    dh: state.DHs.publicKey,
    pn: state.PN,
    n: state.Ns,
  };

  const ad = concat(associatedData, encodeHeader(header));
  const ciphertext = aesGcmEncrypt(encKey, plaintext, ad);

  return {
    state: { ...state, CKs, Ns: state.Ns + 1 },
    message: { header, ciphertext },
  };
}

// ─── Decrypt ─────────────────────────────────────────────────────────────────

export function ratchetDecrypt(
  state: RatchetState,
  message: EncryptedMessage,
  associatedData: Uint8Array
): { state: RatchetState; plaintext: Uint8Array } {
  // Try skipped message keys first
  const skipKey = `${toBase64(message.header.dh)}:${message.header.n}`;
  if (state.MKSKIPPED[skipKey]) {
    const mk = state.MKSKIPPED[skipKey].messageKey;
    const { encKey } = deriveMessageKeys(mk);
    const ad = concat(associatedData, encodeHeader(message.header));
    const plaintext = aesGcmDecrypt(encKey, message.ciphertext, ad);
    const MKSKIPPED = { ...state.MKSKIPPED };
    delete MKSKIPPED[skipKey];
    return { state: { ...state, MKSKIPPED }, plaintext };
  }

  let s = state;

  // DH ratchet step if we see a new remote DH key
  if (!s.DHr || toBase64(message.header.dh) !== toBase64(s.DHr)) {
    s = skipMessageKeys(s, message.header.pn);
    s = dhRatchetStep(s, message.header.dh);
  }

  s = skipMessageKeys(s, message.header.n);

  const [CKr, mk] = kdfCK(s.CKr!);
  const { encKey } = deriveMessageKeys(mk);
  const ad = concat(associatedData, encodeHeader(message.header));
  const plaintext = aesGcmDecrypt(encKey, message.ciphertext, ad);

  return { state: { ...s, CKr, Nr: s.Nr + 1 }, plaintext };
}

// ─── DH ratchet step ──────────────────────────────────────────────────────────

function dhRatchetStep(state: RatchetState, remoteDH: Uint8Array): RatchetState {
  const PN = state.Ns;
  const dh1 = x25519Dh(state.DHs.secretKey, remoteDH);
  const [RK1, CKr] = kdfRK(state.RK, dh1);
  const DHs = x25519KeyPair();
  const dh2 = x25519Dh(DHs.secretKey, remoteDH);
  const [RK, CKs] = kdfRK(RK1, dh2);

  return {
    ...state,
    RK,
    CKs,
    Ns: 0,
    CKr,
    Nr: 0,
    DHs,
    DHr: remoteDH,
    PN,
  };
}

function skipMessageKeys(state: RatchetState, until: number): RatchetState {
  if (state.Nr + MAX_SKIP < until) throw new Error('Too many skipped messages');
  if (!state.CKr) return state;

  let s = state;
  while (s.Nr < until) {
    const [CKr, mk] = kdfCK(s.CKr!);
    const key = `${toBase64(s.DHr!)}:${s.Nr}`;
    s = {
      ...s,
      CKr,
      Nr: s.Nr + 1,
      MKSKIPPED: { ...s.MKSKIPPED, [key]: { messageKey: mk } },
    };
  }
  return s;
}

// ─── Header serialisation ────────────────────────────────────────────────────

function encodeHeader(h: MessageHeader): Uint8Array {
  const pnBuf = new Uint8Array(4);
  const nBuf = new Uint8Array(4);
  new DataView(pnBuf.buffer).setUint32(0, h.pn);
  new DataView(nBuf.buffer).setUint32(0, h.n);
  return concat(h.dh, pnBuf, nBuf);
}

export function serializeState(state: RatchetState): string {
  return JSON.stringify({
    RK: toBase64(state.RK),
    CKs: state.CKs ? toBase64(state.CKs) : null,
    Ns: state.Ns,
    CKr: state.CKr ? toBase64(state.CKr) : null,
    Nr: state.Nr,
    DHs: { publicKey: toBase64(state.DHs.publicKey), secretKey: toBase64(state.DHs.secretKey) },
    DHr: state.DHr ? toBase64(state.DHr) : null,
    PN: state.PN,
    MKSKIPPED: Object.fromEntries(
      Object.entries(state.MKSKIPPED).map(([k, v]) => [k, toBase64(v.messageKey)])
    ),
  });
}

export function deserializeState(raw: string): RatchetState {
  const d = JSON.parse(raw);
  return {
    RK: fromBase64(d.RK),
    CKs: d.CKs ? fromBase64(d.CKs) : null,
    Ns: d.Ns,
    CKr: d.CKr ? fromBase64(d.CKr) : null,
    Nr: d.Nr,
    DHs: { publicKey: fromBase64(d.DHs.publicKey), secretKey: fromBase64(d.DHs.secretKey) },
    DHr: d.DHr ? fromBase64(d.DHr) : null,
    PN: d.PN,
    MKSKIPPED: Object.fromEntries(
      Object.entries(d.MKSKIPPED as Record<string, string>).map(([k, v]) => [
        k,
        { messageKey: fromBase64(v) },
      ])
    ),
  };
}

function fromBase64(b64: string): Uint8Array {
  const { Buffer } = require('buffer');
  return new Uint8Array(Buffer.from(b64, 'base64'));
}
