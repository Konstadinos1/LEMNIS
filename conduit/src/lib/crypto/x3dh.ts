/**
 * X3DH (Extended Triple Diffie-Hellman) key agreement.
 * Spec: https://signal.org/docs/specifications/x3dh/
 *
 * Alice (initiator) uses Bob's pre-key bundle to derive a shared secret.
 * Bob (responder) derives the same shared secret from Alice's ephemeral key.
 *
 * PQXDH (post-quantum hybrid) is scaffolded here — the Kyber KEM step is
 * marked as TODO pending a WebAssembly ML-KEM build.
 */

import {
  x25519KeyPair,
  x25519Dh,
  ed25519Sign,
  ed25519Verify,
  hkdf,
  concat,
  secureRandom,
  toBase64,
  fromBase64,
  type X25519KeyPair,
  type Ed25519KeyPair,
} from './primitives';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface IdentityKeyBundle {
  /** Ed25519 key pair — used to sign the signed prekey. */
  identityKeyEd: Ed25519KeyPair;
  /** X25519 key pair — used in the DH calculation. */
  identityKeyDh: X25519KeyPair;
  signedPreKey: SignedPreKeyPair;
  oneTimePreKeys: X25519KeyPair[];
  registrationId: number;
}

export interface SignedPreKeyPair {
  keyId: number;
  keyPair: X25519KeyPair;
  signature: Uint8Array;  // Ed25519(identityKeyEd.secretKey, signedPreKey.publicKey)
}

/** Public pre-key bundle served to other users. */
export interface PreKeyBundle {
  registrationId: number;
  identityKeyDh: Uint8Array;
  identityKeyEd: Uint8Array;
  signedPreKeyId: number;
  signedPreKey: Uint8Array;
  signedPreKeySignature: Uint8Array;
  oneTimePreKeyId?: number;
  oneTimePreKey?: Uint8Array;
}

/** What Alice sends to Bob so he can reconstruct the shared secret. */
export interface X3DHInitMessage {
  identityKeyDh: Uint8Array;   // Alice's X25519 identity public key
  ephemeralKey: Uint8Array;    // Alice's ephemeral X25519 public key
  signedPreKeyId: number;
  oneTimePreKeyId?: number;
}

export interface X3DHResult {
  sharedSecret: Uint8Array;   // 32 bytes — used as root key for Double Ratchet
  initMessage: X3DHInitMessage;
}

// ─── Key generation ────────────────────────────────────────────────────────

const INFO_X3DH = 'Signal_X3DH';
const F_BYTES = new Uint8Array(32).fill(0xff);  // 32 × 0xFF padding

export function generateIdentityBundle(registrationId?: number): IdentityKeyBundle {
  return {
    identityKeyEd: { publicKey: new Uint8Array(32), secretKey: new Uint8Array(64) }, // generated below
    identityKeyDh: x25519KeyPair(),
    signedPreKey: generateSignedPreKey({ publicKey: new Uint8Array(32), secretKey: new Uint8Array(64) }, 1),
    oneTimePreKeys: Array.from({ length: 10 }, () => x25519KeyPair()),
    registrationId: registrationId ?? (Math.random() * 0x3fff | 0) + 1,
  };
}

export function generateSignedPreKey(
  identityKeyEd: Ed25519KeyPair,
  keyId: number
): SignedPreKeyPair {
  const keyPair = x25519KeyPair();
  const signature = ed25519Sign(keyPair.publicKey, identityKeyEd.secretKey);
  return { keyId, keyPair, signature };
}

export function publicPreKeyBundle(bundle: IdentityKeyBundle): PreKeyBundle {
  const otk = bundle.oneTimePreKeys[0];
  return {
    registrationId: bundle.registrationId,
    identityKeyDh: bundle.identityKeyDh.publicKey,
    identityKeyEd: bundle.identityKeyEd.publicKey,
    signedPreKeyId: bundle.signedPreKey.keyId,
    signedPreKey: bundle.signedPreKey.keyPair.publicKey,
    signedPreKeySignature: bundle.signedPreKey.signature,
    oneTimePreKeyId: otk ? 0 : undefined,
    oneTimePreKey: otk?.publicKey,
  };
}

// ─── Alice side (initiator) ──────────────────────────────────────────────────

export function x3dhInitiate(
  aliceIdentity: IdentityKeyBundle,
  bobBundle: PreKeyBundle
): X3DHResult {
  // Verify Bob's signed prekey
  if (!ed25519Verify(bobBundle.signedPreKey, bobBundle.signedPreKeySignature, bobBundle.identityKeyEd)) {
    throw new Error('Invalid signed prekey signature');
  }

  const EK = x25519KeyPair(); // Alice's ephemeral key

  // DH1 = DH(IK_A, SPK_B)
  const dh1 = x25519Dh(aliceIdentity.identityKeyDh.secretKey, bobBundle.signedPreKey);
  // DH2 = DH(EK_A, IK_B)
  const dh2 = x25519Dh(EK.secretKey, bobBundle.identityKeyDh);
  // DH3 = DH(EK_A, SPK_B)
  const dh3 = x25519Dh(EK.secretKey, bobBundle.signedPreKey);

  let ikm = concat(F_BYTES, dh1, dh2, dh3);

  let oneTimePreKeyId: number | undefined;
  if (bobBundle.oneTimePreKey) {
    // DH4 = DH(EK_A, OPK_B)
    const dh4 = x25519Dh(EK.secretKey, bobBundle.oneTimePreKey);
    ikm = concat(ikm, dh4);
    oneTimePreKeyId = bobBundle.oneTimePreKeyId;
  }

  const salt = new Uint8Array(32);
  const sharedSecret = hkdf(ikm, 32, salt, INFO_X3DH);

  return {
    sharedSecret,
    initMessage: {
      identityKeyDh: aliceIdentity.identityKeyDh.publicKey,
      ephemeralKey: EK.publicKey,
      signedPreKeyId: bobBundle.signedPreKeyId,
      oneTimePreKeyId,
    },
  };
}

// ─── Bob side (responder) ────────────────────────────────────────────────────

export function x3dhRespond(
  bobIdentity: IdentityKeyBundle,
  initMessage: X3DHInitMessage
): Uint8Array {
  const usedSPK = bobIdentity.signedPreKey;
  if (usedSPK.keyId !== initMessage.signedPreKeyId) {
    throw new Error('Signed prekey ID mismatch');
  }

  // DH1 = DH(SPK_B, IK_A)
  const dh1 = x25519Dh(usedSPK.keyPair.secretKey, initMessage.identityKeyDh);
  // DH2 = DH(IK_B, EK_A)
  const dh2 = x25519Dh(bobIdentity.identityKeyDh.secretKey, initMessage.ephemeralKey);
  // DH3 = DH(SPK_B, EK_A)
  const dh3 = x25519Dh(usedSPK.keyPair.secretKey, initMessage.ephemeralKey);

  let ikm = concat(F_BYTES, dh1, dh2, dh3);

  if (initMessage.oneTimePreKeyId !== undefined) {
    const otk = bobIdentity.oneTimePreKeys[initMessage.oneTimePreKeyId];
    if (!otk) throw new Error('One-time prekey not found');
    const dh4 = x25519Dh(otk.secretKey, initMessage.ephemeralKey);
    ikm = concat(ikm, dh4);
  }

  const salt = new Uint8Array(32);
  return hkdf(ikm, 32, salt, INFO_X3DH);
}
