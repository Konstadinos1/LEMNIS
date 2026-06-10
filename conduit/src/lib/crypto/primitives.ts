/**
 * Crypto primitives — native Rust layer (conduit-crypto) with JS fallback.
 *
 * The Rust module (X25519, Ed25519, AES-256-GCM, HKDF, HMAC) runs in the
 * Secure Enclave / StrongBox execution context via JSI and is loaded at boot.
 * If the native module is unavailable (CI, web) we fall back to tweetnacl +
 * react-native-quick-crypto — identical algorithms, different implementation.
 */

import { Buffer } from 'buffer';
import nacl from 'tweetnacl';
import { ml_kem768 } from '@noble/post-quantum/ml-kem';

// react-native-quick-crypto exposes the Node crypto API via JSI
const qc = (() => {
  try {
    return require('react-native-quick-crypto') as typeof import('crypto');
  } catch {
    return null;
  }
})();

// Rust native module (conduit-crypto) — may be null before first JS bundle
let _native: typeof import('conduit-crypto') | null = null;
try {
  _native = require('conduit-crypto');
} catch {
  // Native module not linked — will use JS fallback
}

// ─── Base64 helpers ─────────────────────────────────────────────────────────

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

// ─── Random bytes ────────────────────────────────────────────────────────────

export async function secureRandomAsync(n: number): Promise<Uint8Array> {
  if (_native) {
    return fromBase64(await _native.randomBytes(n));
  }
  if (qc) return new Uint8Array(qc.randomBytes(n));
  const out = new Uint8Array(n);
  crypto.getRandomValues(out);
  return out;
}

/** Sync fallback — use secureRandomAsync in production async paths. */
export function secureRandom(n: number): Uint8Array {
  if (qc) return new Uint8Array(qc.randomBytes(n));
  const out = new Uint8Array(n);
  crypto.getRandomValues(out);
  return out;
}

// ─── HKDF-SHA-256 ────────────────────────────────────────────────────────────

export async function hkdfAsync(
  ikm: Uint8Array,
  length: number,
  salt: Uint8Array,
  info: string,
): Promise<Uint8Array> {
  if (_native) {
    const infoBytes = new TextEncoder().encode(info);
    return fromBase64(await _native.hkdfSha256(
      toBase64(ikm),
      toBase64(salt),
      toBase64(infoBytes),
      length,
    ));
  }
  return hkdf(ikm, length, salt, info);
}

export function hkdf(
  ikm: Uint8Array,
  length: number,
  salt: Uint8Array,
  info: string,
): Uint8Array {
  if (!qc) throw new Error('react-native-quick-crypto unavailable');
  const out = qc.hkdfSync('sha256', ikm, salt, Buffer.from(info, 'utf8'), length);
  return new Uint8Array(out as ArrayBuffer);
}

// ─── HMAC-SHA-256 ─────────────────────────────────────────────────────────────

export async function hmacSha256Async(key: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  if (_native) {
    return fromBase64(await _native.hmacSha256(toBase64(key), toBase64(data)));
  }
  return hmacSha256(key, data);
}

export function hmacSha256(key: Uint8Array, data: Uint8Array): Uint8Array {
  if (!qc) throw new Error('react-native-quick-crypto unavailable');
  const mac = qc.createHmac('sha256', key as Buffer);
  mac.update(data as Buffer);
  return new Uint8Array(mac.digest() as Buffer);
}

// ─── AES-256-GCM ─────────────────────────────────────────────────────────────

export interface AesGcmCiphertext {
  iv: Uint8Array;     // 12 bytes
  tag: Uint8Array;    // 16 bytes (also appended to ciphertext in Rust layout)
  ciphertext: Uint8Array;
}

export async function aesGcmEncryptAsync(
  key: Uint8Array,
  plaintext: Uint8Array,
  associatedData?: Uint8Array,
): Promise<AesGcmCiphertext> {
  if (_native) {
    const iv = await secureRandomAsync(12);
    const ctWithTag = fromBase64(await _native.aesGcmEncrypt(
      toBase64(key),
      toBase64(iv),
      toBase64(plaintext),
      associatedData ? toBase64(associatedData) : undefined,
    ));
    // Rust returns ciphertext||tag; split them
    const ciphertext = ctWithTag.slice(0, ctWithTag.length - 16);
    const tag = ctWithTag.slice(ctWithTag.length - 16);
    return { iv, tag, ciphertext };
  }
  return aesGcmEncrypt(key, plaintext, associatedData);
}

export function aesGcmEncrypt(
  key: Uint8Array,
  plaintext: Uint8Array,
  associatedData?: Uint8Array,
): AesGcmCiphertext {
  if (!qc) throw new Error('react-native-quick-crypto unavailable');
  const iv = secureRandom(12);
  const cipher = qc.createCipheriv('aes-256-gcm', key as Buffer, iv as Buffer) as any;
  if (associatedData) cipher.setAAD(associatedData as Buffer);
  const c1 = cipher.update(plaintext as Buffer);
  const c2 = cipher.final();
  const ciphertext = Buffer.concat([c1, c2]);
  const tag = cipher.getAuthTag();
  return { iv, tag: new Uint8Array(tag), ciphertext: new Uint8Array(ciphertext) };
}

export async function aesGcmDecryptAsync(
  key: Uint8Array,
  ct: AesGcmCiphertext,
  associatedData?: Uint8Array,
): Promise<Uint8Array> {
  if (_native) {
    // Reconstruct ciphertext||tag as Rust expects
    const ctWithTag = concat(ct.ciphertext, ct.tag);
    return fromBase64(await _native.aesGcmDecrypt(
      toBase64(key),
      toBase64(ct.iv),
      toBase64(ctWithTag),
      associatedData ? toBase64(associatedData) : undefined,
    ));
  }
  return aesGcmDecrypt(key, ct, associatedData);
}

export function aesGcmDecrypt(
  key: Uint8Array,
  ct: AesGcmCiphertext,
  associatedData?: Uint8Array,
): Uint8Array {
  if (!qc) throw new Error('react-native-quick-crypto unavailable');
  const decipher = qc.createDecipheriv('aes-256-gcm', key as Buffer, ct.iv as Buffer) as any;
  decipher.setAuthTag(ct.tag as Buffer);
  if (associatedData) decipher.setAAD(associatedData as Buffer);
  const p1 = decipher.update(ct.ciphertext as Buffer);
  const p2 = decipher.final();
  return new Uint8Array(Buffer.concat([p1, p2]));
}

// ─── X25519 ──────────────────────────────────────────────────────────────────

export interface X25519KeyPair {
  publicKey: Uint8Array;  // 32 bytes
  secretKey: Uint8Array;  // 32 bytes
}

export async function x25519KeyPairAsync(): Promise<X25519KeyPair> {
  if (_native) {
    const { secretKey, publicKey } = await _native.x25519Keypair();
    return { secretKey: fromBase64(secretKey), publicKey: fromBase64(publicKey) };
  }
  return x25519KeyPair();
}

export function x25519KeyPair(): X25519KeyPair {
  const kp = nacl.box.keyPair();
  return { publicKey: kp.publicKey, secretKey: kp.secretKey };
}

export function x25519KeyPairFromSeed(seed: Uint8Array): X25519KeyPair {
  const kp = nacl.box.keyPair.fromSecretKey(seed);
  return { publicKey: kp.publicKey, secretKey: kp.secretKey };
}

export async function x25519DhAsync(
  mySecretKey: Uint8Array,
  theirPublicKey: Uint8Array,
): Promise<Uint8Array> {
  if (_native) {
    return fromBase64(await _native.x25519DH(toBase64(mySecretKey), toBase64(theirPublicKey)));
  }
  return x25519Dh(mySecretKey, theirPublicKey);
}

export function x25519Dh(mySecretKey: Uint8Array, theirPublicKey: Uint8Array): Uint8Array {
  return nacl.scalarMult(mySecretKey, theirPublicKey);
}

// ─── Ed25519 ─────────────────────────────────────────────────────────────────

export interface Ed25519KeyPair {
  publicKey: Uint8Array;  // 32 bytes
  secretKey: Uint8Array;  // 64 bytes (seed || public)
}

export async function ed25519KeyPairAsync(): Promise<Ed25519KeyPair> {
  if (_native) {
    const { secretKey, publicKey } = await _native.ed25519Keypair();
    return { secretKey: fromBase64(secretKey), publicKey: fromBase64(publicKey) };
  }
  return ed25519KeyPair();
}

export function ed25519KeyPair(): Ed25519KeyPair {
  const kp = nacl.sign.keyPair();
  return { publicKey: kp.publicKey, secretKey: kp.secretKey };
}

export async function ed25519SignAsync(message: Uint8Array, secretKey: Uint8Array): Promise<Uint8Array> {
  if (_native) {
    return fromBase64(await _native.ed25519Sign(toBase64(message), toBase64(secretKey)));
  }
  return ed25519Sign(message, secretKey);
}

export function ed25519Sign(message: Uint8Array, secretKey: Uint8Array): Uint8Array {
  return nacl.sign.detached(message, secretKey);
}

export async function ed25519VerifyAsync(
  message: Uint8Array,
  signature: Uint8Array,
  publicKey: Uint8Array,
): Promise<boolean> {
  if (_native) {
    return _native.ed25519Verify(toBase64(message), toBase64(signature), toBase64(publicKey));
  }
  return ed25519Verify(message, signature, publicKey);
}

export function ed25519Verify(
  message: Uint8Array,
  signature: Uint8Array,
  publicKey: Uint8Array,
): boolean {
  return nacl.sign.detached.verify(message, signature, publicKey);
}

// ─── SHA-256 ─────────────────────────────────────────────────────────────────

export async function sha256Async(data: Uint8Array): Promise<Uint8Array> {
  if (_native) {
    return fromBase64(await _native.sha256(toBase64(data)));
  }
  return sha256(data);
}

export function sha256(data: Uint8Array): Uint8Array {
  if (!qc) throw new Error('react-native-quick-crypto unavailable');
  const hash = qc.createHash('sha256');
  hash.update(data as Buffer);
  return new Uint8Array(hash.digest() as Buffer);
}

// ─── ML-KEM-768 (FIPS 203 / Kyber) ──────────────────────────────────────────

export interface MlKemKeyPair {
  publicKey: Uint8Array;  // 1184 bytes
  secretKey: Uint8Array;  // 2400 bytes
}

export function mlKemKeyPair(): MlKemKeyPair {
  return ml_kem768.keygen();
}

export async function mlKemEncapsulateAsync(
  publicKey: Uint8Array,
): Promise<{ ciphertext: Uint8Array; sharedSecret: Uint8Array }> {
  const { cipherText, sharedSecret } = ml_kem768.encapsulate(publicKey);
  return { ciphertext: cipherText, sharedSecret };
}

export async function mlKemDecapsulateAsync(
  ciphertext: Uint8Array,
  secretKey: Uint8Array,
): Promise<Uint8Array> {
  return ml_kem768.decapsulate(ciphertext, secretKey);
}

// ─── Constant-time equality ──────────────────────────────────────────────────

export async function constantTimeEqualAsync(a: Uint8Array, b: Uint8Array): Promise<boolean> {
  if (_native) {
    return _native.constantTimeEq(toBase64(a), toBase64(b));
  }
  return constantTimeEqual(a, b);
}

export function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  return nacl.verify(a, b);
}
