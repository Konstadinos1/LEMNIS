/**
 * X3DH (Extended Triple Diffie-Hellman) key agreement.
 * Spec: https://signal.org/docs/specifications/x3dh/
 *
 * Alice (initiator) uses Bob's pre-key bundle to derive a shared secret.
 * Bob (responder) derives the same shared secret from Alice's ephemeral key.
 *
 * PQXDH (post-quantum hybrid) is scaffolded here — the Kyber KEM step is
 * marked as TODO pending a WebAssembly ML-KEM build.
 *
 * All operations are async — they route through the Rust native module
 * (conduit-crypto) when available, with a JS fallback.
 */

import {
  x25519KeyPairAsync,
  x25519DhAsync,
  ed25519SignAsync,
  ed25519VerifyAsync,
  hkdfAsync,
  mlKemKeyPair,
  mlKemEncapsulateAsync,
  mlKemDecapsulateAsync,
  concat,
  toBase64,
  fromBase64,
  type X25519KeyPair,
  type Ed25519KeyPair,
  type MlKemKeyPair,
} from './primitives';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface IdentityKeyBundle {
  identityKeyEd:  Ed25519KeyPair;
  identityKeyDh:  X25519KeyPair;
  signedPreKey:   SignedPreKeyPair;
  kyberPreKey:    KyberPreKeyPair;
  oneTimePreKeys: X25519KeyPair[];
  registrationId: number;
}

export interface SignedPreKeyPair {
  keyId:     number;
  keyPair:   X25519KeyPair;
  signature: Uint8Array;   // Ed25519(identityKeyEd.secretKey, signedPreKey.publicKey)
}

export interface KyberPreKeyPair {
  keyId:     number;
  keyPair:   MlKemKeyPair;
  signature: Uint8Array;   // Ed25519(identityKeyEd.secretKey, kyberPreKey.publicKey)
}

export interface PreKeyBundle {
  registrationId:        number;
  identityKeyDh:         Uint8Array;
  identityKeyEd:         Uint8Array;
  signedPreKeyId:        number;
  signedPreKey:          Uint8Array;
  signedPreKeySignature: Uint8Array;
  kyberPreKeyId:         number;
  kyberPreKey:           Uint8Array;  // 1184-byte ML-KEM-768 public key
  kyberPreKeySig:        Uint8Array;
  oneTimePreKeyId?:      number;
  oneTimePreKey?:        Uint8Array;
  /** Remaining OTK count on the relay — client should replenish when < 5. */
  otkRemaining?:         number;
}

export interface X3DHInitMessage {
  identityKeyDh:    Uint8Array;
  ephemeralKey:     Uint8Array;
  signedPreKeyId:   number;
  kyberCiphertext:  Uint8Array;  // 1088-byte ML-KEM-768 ciphertext
  kyberPreKeyId:    number;
  oneTimePreKeyId?: number;
}

export interface X3DHResult {
  sharedSecret: Uint8Array;
  initMessage:  X3DHInitMessage;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const INFO_X3DH = 'Signal_X3DH';
const F_BYTES   = new Uint8Array(32).fill(0xff);  // 32 × 0xFF padding prepended to IKM

// ─── Key generation ───────────────────────────────────────────────────────────

export async function generateIdentityBundle(registrationId?: number): Promise<IdentityKeyBundle> {
  const { ed25519KeyPairAsync: ed25519KP } = await import('./primitives');
  const realEdKP = await ed25519KP();

  const [identityKeyDh, spk, kyberPreKey, ...otks] = await Promise.all([
    x25519KeyPairAsync(),
    generateSignedPreKey(realEdKP, 1),
    generateKyberPreKey(realEdKP, 1),
    ...Array.from({ length: 10 }, () => x25519KeyPairAsync()),
  ]);

  return {
    identityKeyEd:  realEdKP,
    identityKeyDh,
    signedPreKey:   spk,
    kyberPreKey,
    oneTimePreKeys: otks,
    registrationId: registrationId ?? ((Math.random() * 0x3fff | 0) + 1),
  };
}

export async function generateSignedPreKey(
  identityKeyEd: Ed25519KeyPair,
  keyId: number,
): Promise<SignedPreKeyPair> {
  const keyPair   = await x25519KeyPairAsync();
  const signature = await ed25519SignAsync(keyPair.publicKey, identityKeyEd.secretKey);
  return { keyId, keyPair, signature };
}

export async function generateKyberPreKey(
  identityKeyEd: Ed25519KeyPair,
  keyId: number,
): Promise<KyberPreKeyPair> {
  const keyPair   = mlKemKeyPair();
  const signature = await ed25519SignAsync(keyPair.publicKey, identityKeyEd.secretKey);
  return { keyId, keyPair, signature };
}

export function publicPreKeyBundle(bundle: IdentityKeyBundle): PreKeyBundle {
  const otk = bundle.oneTimePreKeys[0];
  return {
    registrationId:        bundle.registrationId,
    identityKeyDh:         bundle.identityKeyDh.publicKey,
    identityKeyEd:         bundle.identityKeyEd.publicKey,
    signedPreKeyId:        bundle.signedPreKey.keyId,
    signedPreKey:          bundle.signedPreKey.keyPair.publicKey,
    signedPreKeySignature: bundle.signedPreKey.signature,
    kyberPreKeyId:         bundle.kyberPreKey.keyId,
    kyberPreKey:           bundle.kyberPreKey.keyPair.publicKey,
    kyberPreKeySig:        bundle.kyberPreKey.signature,
    oneTimePreKeyId:       otk ? 0 : undefined,
    oneTimePreKey:         otk?.publicKey,
  };
}

// ─── Alice side (initiator) ───────────────────────────────────────────────────

export async function x3dhInitiate(
  aliceIdentity: IdentityKeyBundle,
  bobBundle: PreKeyBundle,
): Promise<X3DHResult> {
  // Verify Bob's signed prekey signature
  const valid = await ed25519VerifyAsync(
    bobBundle.signedPreKey,
    bobBundle.signedPreKeySignature,
    bobBundle.identityKeyEd,
  );
  if (!valid) throw new Error('Invalid signed prekey signature');

  const EK = await x25519KeyPairAsync();  // Alice's ephemeral key

  // DH1 = DH(IK_A, SPK_B) || DH2 = DH(EK_A, IK_B) || DH3 = DH(EK_A, SPK_B)
  const [dh1, dh2, dh3] = await Promise.all([
    x25519DhAsync(aliceIdentity.identityKeyDh.secretKey, bobBundle.signedPreKey),
    x25519DhAsync(EK.secretKey, bobBundle.identityKeyDh),
    x25519DhAsync(EK.secretKey, bobBundle.signedPreKey),
  ]);

  let ikm = concat(F_BYTES, dh1, dh2, dh3);
  let oneTimePreKeyId: number | undefined;

  if (bobBundle.oneTimePreKey) {
    // DH4 = DH(EK_A, OPK_B)
    const dh4 = await x25519DhAsync(EK.secretKey, bobBundle.oneTimePreKey);
    ikm = concat(ikm, dh4);
    oneTimePreKeyId = bobBundle.oneTimePreKeyId;
  }

  // PQXDH: ML-KEM-768 encapsulation against Bob's Kyber pre-key
  const { ciphertext: kyberCiphertext, sharedSecret: kyberSS } =
    await mlKemEncapsulateAsync(bobBundle.kyberPreKey);
  ikm = concat(ikm, kyberSS);

  const sharedSecret = await hkdfAsync(ikm, 32, new Uint8Array(32), INFO_X3DH);

  return {
    sharedSecret,
    initMessage: {
      identityKeyDh:   aliceIdentity.identityKeyDh.publicKey,
      ephemeralKey:    EK.publicKey,
      signedPreKeyId:  bobBundle.signedPreKeyId,
      kyberCiphertext,
      kyberPreKeyId:   bobBundle.kyberPreKeyId,
      oneTimePreKeyId,
    },
  };
}

// ─── Bob side (responder) ─────────────────────────────────────────────────────

/**
 * @param lookupOtk  Optional external lookup for replenished OTKs (keyId > 9).
 *                   Falls back to array index for the initial 0-9 set.
 */
export async function x3dhRespond(
  bobIdentity: IdentityKeyBundle,
  initMessage: X3DHInitMessage,
  lookupOtk?: (keyId: number) => Promise<X25519KeyPair | undefined>,
): Promise<Uint8Array> {
  const usedSPK = bobIdentity.signedPreKey;
  if (usedSPK.keyId !== initMessage.signedPreKeyId) {
    throw new Error('Signed prekey ID mismatch');
  }

  // DH1 = DH(SPK_B, IK_A) || DH2 = DH(IK_B, EK_A) || DH3 = DH(SPK_B, EK_A)
  const [dh1, dh2, dh3] = await Promise.all([
    x25519DhAsync(usedSPK.keyPair.secretKey, initMessage.identityKeyDh),
    x25519DhAsync(bobIdentity.identityKeyDh.secretKey, initMessage.ephemeralKey),
    x25519DhAsync(usedSPK.keyPair.secretKey, initMessage.ephemeralKey),
  ]);

  let ikm = concat(F_BYTES, dh1, dh2, dh3);

  if (initMessage.oneTimePreKeyId !== undefined) {
    // Array-index lookup works for initial keyIds 0-9; external lookup covers replenished keys
    let otk: X25519KeyPair | undefined = bobIdentity.oneTimePreKeys[initMessage.oneTimePreKeyId];
    if (!otk && lookupOtk) {
      otk = await lookupOtk(initMessage.oneTimePreKeyId);
    }
    if (!otk) throw new Error(`One-time prekey ${initMessage.oneTimePreKeyId} not found`);
    const dh4 = await x25519DhAsync(otk.secretKey, initMessage.ephemeralKey);
    ikm = concat(ikm, dh4);
  }

  // PQXDH: ML-KEM-768 decapsulation using our Kyber pre-key secret
  const kyberSS = await mlKemDecapsulateAsync(
    initMessage.kyberCiphertext,
    bobIdentity.kyberPreKey.keyPair.secretKey,
  );
  ikm = concat(ikm, kyberSS);

  return hkdfAsync(ikm, 32, new Uint8Array(32), INFO_X3DH);
}
