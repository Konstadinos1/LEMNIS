import { requireNativeModule } from 'expo-modules-core';

const ConduitCrypto = requireNativeModule('ConduitCrypto');

// All byte inputs/outputs use standard base64 (not base64url).
// The TypeScript layer in primitives.ts converts between base64url and base64 as needed.

export interface Keypair {
  secretKey: string; // base64
  publicKey: string; // base64
}

/** Fill `len` bytes of OS randomness. Returns base64. */
export function randomBytes(len: number): Promise<string> {
  return ConduitCrypto.randomBytes(len);
}

/** Generate a fresh X25519 keypair. secretKey: 32 bytes, publicKey: 32 bytes. */
export function x25519Keypair(): Promise<Keypair> {
  return ConduitCrypto.x25519Keypair();
}

/** X25519 Diffie-Hellman → 32-byte shared secret (base64). */
export function x25519DH(mySecretKey: string, theirPublicKey: string): Promise<string> {
  return ConduitCrypto.x25519DH(mySecretKey, theirPublicKey);
}

/** Generate a fresh Ed25519 keypair. secretKey: 64 bytes ([seed||pub]), publicKey: 32 bytes. */
export function ed25519Keypair(): Promise<Keypair> {
  return ConduitCrypto.ed25519Keypair();
}

/** Sign `message` (base64) with Ed25519 `secretKey` (64-byte base64). Returns 64-byte signature (base64). */
export function ed25519Sign(message: string, secretKey: string): Promise<string> {
  return ConduitCrypto.ed25519Sign(message, secretKey);
}

/** Verify Ed25519 signature. Returns true iff valid. */
export function ed25519Verify(message: string, signature: string, publicKey: string): Promise<boolean> {
  return ConduitCrypto.ed25519Verify(message, signature, publicKey);
}

/**
 * AES-256-GCM encrypt.
 * key: 32-byte base64, nonce: 12-byte base64 (caller supplies random).
 * aad: optional base64 associated data.
 * Returns base64 ciphertext with 16-byte GCM tag appended.
 */
export function aesGcmEncrypt(
  key: string,
  nonce: string,
  plaintext: string,
  aad?: string,
): Promise<string> {
  return ConduitCrypto.aesGcmEncrypt(key, nonce, plaintext, aad ?? null);
}

/**
 * AES-256-GCM decrypt.
 * ciphertext includes the 16-byte GCM tag.
 * Returns base64 plaintext or throws on auth failure.
 */
export function aesGcmDecrypt(
  key: string,
  nonce: string,
  ciphertext: string,
  aad?: string,
): Promise<string> {
  return ConduitCrypto.aesGcmDecrypt(key, nonce, ciphertext, aad ?? null);
}

/**
 * HKDF-SHA-256 extract+expand.
 * ikm, salt, info: base64 (salt and info may be null).
 * outputLen: bytes to produce.
 * Returns base64 key material.
 */
export function hkdfSha256(
  ikm: string,
  salt: string | null,
  info: string | null,
  outputLen: number,
): Promise<string> {
  return ConduitCrypto.hkdfSha256(ikm, salt, info, outputLen);
}

/** HMAC-SHA-256. key and data are base64. Returns 32-byte base64 MAC. */
export function hmacSha256(key: string, data: string): Promise<string> {
  return ConduitCrypto.hmacSha256(key, data);
}

/** SHA-256 hash. data is base64. Returns 32-byte base64 hash. */
export function sha256(data: string): Promise<string> {
  return ConduitCrypto.sha256(data);
}

/** Constant-time byte comparison. Returns true iff a === b (same length and content). */
export function constantTimeEq(a: string, b: string): Promise<boolean> {
  return ConduitCrypto.constantTimeEq(a, b);
}
