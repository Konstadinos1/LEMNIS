/**
 * Crypto primitives.
 * X25519/Ed25519 via tweetnacl (audited, pure-JS, works on RN).
 * AES-256-GCM + HKDF via react-native-quick-crypto (JSI-backed OpenSSL).
 */

import nacl from 'tweetnacl';
import { Buffer } from 'buffer';

// react-native-quick-crypto exposes the Node crypto API via JSI
const { createCipheriv, createDecipheriv, hkdfSync, createHmac, randomBytes } =
  require('react-native-quick-crypto') as typeof import('crypto');

// ─── Random bytes ───────────────────────────────────────────────────────────

export function secureRandom(n: number): Uint8Array {
  return new Uint8Array(randomBytes(n));
}

// ─── HKDF-SHA-256 ────────────────────────────────────────────────────────────

export function hkdf(
  ikm: Uint8Array,
  length: number,
  salt: Uint8Array,
  info: string
): Uint8Array {
  const out = hkdfSync('sha256', ikm, salt, Buffer.from(info, 'utf8'), length);
  return new Uint8Array(out as ArrayBuffer);
}

// ─── HMAC-SHA-256 ─────────────────────────────────────────────────────────

export function hmacSha256(key: Uint8Array, data: Uint8Array): Uint8Array {
  const mac = createHmac('sha256', key as Buffer);
  mac.update(data as Buffer);
  return new Uint8Array(mac.digest() as Buffer);
}

// ─── AES-256-GCM ─────────────────────────────────────────────────────────────

const AES_KEY_LEN = 32;
const AES_IV_LEN = 12;
const AES_TAG_LEN = 16;

export interface AesGcmCiphertext {
  iv: Uint8Array;
  tag: Uint8Array;
  ciphertext: Uint8Array;
}

export function aesGcmEncrypt(
  key: Uint8Array,
  plaintext: Uint8Array,
  associatedData?: Uint8Array
): AesGcmCiphertext {
  const iv = secureRandom(AES_IV_LEN);
  const cipher = createCipheriv('aes-256-gcm', key as Buffer, iv as Buffer) as any;
  if (associatedData) cipher.setAAD(associatedData as Buffer);
  const c1 = cipher.update(plaintext as Buffer);
  const c2 = cipher.final();
  const ciphertext = Buffer.concat([c1, c2]);
  const tag = cipher.getAuthTag();
  return {
    iv,
    tag: new Uint8Array(tag),
    ciphertext: new Uint8Array(ciphertext),
  };
}

export function aesGcmDecrypt(
  key: Uint8Array,
  ct: AesGcmCiphertext,
  associatedData?: Uint8Array
): Uint8Array {
  const decipher = createDecipheriv('aes-256-gcm', key as Buffer, ct.iv as Buffer) as any;
  decipher.setAuthTag(ct.tag as Buffer);
  if (associatedData) decipher.setAAD(associatedData as Buffer);
  const p1 = decipher.update(ct.ciphertext as Buffer);
  const p2 = decipher.final();
  return new Uint8Array(Buffer.concat([p1, p2]));
}

// ─── X25519 (Curve25519 DH) via tweetnacl ──────────────────────────────────

export interface X25519KeyPair {
  publicKey: Uint8Array;   // 32 bytes
  secretKey: Uint8Array;   // 32 bytes
}

export function x25519KeyPair(): X25519KeyPair {
  // nacl.box uses Curve25519 internally
  const kp = nacl.box.keyPair();
  return { publicKey: kp.publicKey, secretKey: kp.secretKey };
}

export function x25519KeyPairFromSeed(seed: Uint8Array): X25519KeyPair {
  const kp = nacl.box.keyPair.fromSecretKey(seed);
  return { publicKey: kp.publicKey, secretKey: kp.secretKey };
}

/** Curve25519 scalar multiplication — the DH step. */
export function x25519Dh(mySecretKey: Uint8Array, theirPublicKey: Uint8Array): Uint8Array {
  return nacl.scalarMult(mySecretKey, theirPublicKey);
}

// ─── Ed25519 signing ─────────────────────────────────────────────────────────

export interface Ed25519KeyPair {
  publicKey: Uint8Array;   // 32 bytes
  secretKey: Uint8Array;   // 64 bytes (seed || public)
}

export function ed25519KeyPair(): Ed25519KeyPair {
  const kp = nacl.sign.keyPair();
  return { publicKey: kp.publicKey, secretKey: kp.secretKey };
}

export function ed25519Sign(message: Uint8Array, secretKey: Uint8Array): Uint8Array {
  return nacl.sign.detached(message, secretKey);
}

export function ed25519Verify(
  message: Uint8Array,
  signature: Uint8Array,
  publicKey: Uint8Array
): boolean {
  return nacl.sign.detached.verify(message, signature, publicKey);
}

// ─── Utilities ───────────────────────────────────────────────────────────────

export function toBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64');
}

export function fromBase64(b64: string): Uint8Array {
  return new Uint8Array(Buffer.from(b64, 'base64'));
}

export function toHex(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('hex');
}

export function fromHex(hex: string): Uint8Array {
  return new Uint8Array(Buffer.from(hex, 'hex'));
}

export function concat(...arrays: Uint8Array[]): Uint8Array {
  const total = arrays.reduce((n, a) => n + a.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const a of arrays) {
    out.set(a, offset);
    offset += a.length;
  }
  return out;
}

export function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  return nacl.verify(a, b);
}
