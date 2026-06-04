/**
 * Passkey (secp256r1/WebAuthn) management.
 *
 * On iOS, passkeys are backed by Secure Enclave via ASAuthorizationPlatformPublicKeyCredential.
 * On Android, they use StrongBox-backed KeyStore via Credential Manager.
 *
 * This module wraps expo-local-authentication for biometric gating and
 * expo-crypto for software-key dev fallback when passkey hardware APIs
 * aren't available (simulator / CI).
 *
 * Production: swap the software-fallback path with a custom Expo Module that
 * calls ASAuthorization (iOS) / CredentialManager (Android).
 */

import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import { Buffer } from 'buffer';
import { toBase64, fromBase64 } from '@/lib/crypto/primitives';

const KEY_PASSKEY_ID = 'conduit.passkey.credentialId';
const KEY_PASSKEY_PUB = 'conduit.passkey.publicKey';

export interface PasskeyCredential {
  credentialId: string;
  publicKeyUncompressed: Uint8Array;   // 65 bytes: 0x04 || x || y (P-256)
  publicKeyHex: string;
}

export interface PasskeySignature {
  r: Uint8Array;
  s: Uint8Array;
  authenticatorData: Uint8Array;
  clientDataJSON: Uint8Array;
}

/** Create (or retrieve existing) passkey credential. */
export async function createOrLoadPasskey(
  rpId = 'conduit.app',
  userName = 'Conduit Wallet'
): Promise<PasskeyCredential> {
  // Return cached credential if available
  const existing = await loadPasskeyCredential();
  if (existing) return existing;

  // Biometric gate before key creation
  const bio = await LocalAuthentication.authenticateAsync({
    promptMessage: 'Create your wallet passkey',
    cancelLabel: 'Cancel',
  });
  if (!bio.success) throw new Error('Biometric authentication failed');

  // ── Software fallback (dev / simulator) ─────────────────────────────────
  // In production, replace this with a native Expo Module that calls
  // ASAuthorization (iOS) / CredentialManager (Android) to generate a
  // hardware-backed secp256r1 key in the Secure Enclave / StrongBox.
  const randomBytes = await Crypto.getRandomBytesAsync(32);
  const credentialId = toBase64(new Uint8Array(randomBytes));

  // P-256 uncompressed public key placeholder (65 bytes)
  const pubKeyBytes = new Uint8Array(65);
  pubKeyBytes[0] = 0x04;
  const pubRandom = await Crypto.getRandomBytesAsync(64);
  pubKeyBytes.set(new Uint8Array(pubRandom), 1);
  // ── End software fallback ────────────────────────────────────────────────

  const cred: PasskeyCredential = {
    credentialId,
    publicKeyUncompressed: pubKeyBytes,
    publicKeyHex: Buffer.from(pubKeyBytes).toString('hex'),
  };

  await SecureStore.setItemAsync(KEY_PASSKEY_ID, credentialId);
  await SecureStore.setItemAsync(KEY_PASSKEY_PUB, Buffer.from(pubKeyBytes).toString('hex'));

  return cred;
}

export async function loadPasskeyCredential(): Promise<PasskeyCredential | null> {
  const credentialId = await SecureStore.getItemAsync(KEY_PASSKEY_ID);
  const pubHex = await SecureStore.getItemAsync(KEY_PASSKEY_PUB);
  if (!credentialId || !pubHex) return null;

  return {
    credentialId,
    publicKeyUncompressed: new Uint8Array(Buffer.from(pubHex, 'hex')),
    publicKeyHex: pubHex,
  };
}

/**
 * Sign a 32-byte challenge with the passkey.
 * Returns a DER-encoded secp256r1 signature (r, s).
 *
 * Production: calls the native Expo Module → ASAuthorization assertion.
 */
export async function signWithPasskey(
  credentialId: string,
  challengeHex: `0x${string}`
): Promise<PasskeySignature> {
  // Biometric gate
  const bio = await LocalAuthentication.authenticateAsync({
    promptMessage: 'Authenticate to sign',
    cancelLabel: 'Cancel',
  });
  if (!bio.success) throw new Error('Authentication failed');

  // Software fallback: deterministic dummy signature
  const challenge = fromBase64(
    Buffer.from(challengeHex.slice(2), 'hex').toString('base64')
  );

  // 32-byte r and s (placeholder — production uses Secure Enclave assertion)
  const r = new Uint8Array(await Crypto.getRandomBytesAsync(32));
  const s = new Uint8Array(await Crypto.getRandomBytesAsync(32));

  const clientData = new TextEncoder().encode(
    JSON.stringify({ type: 'webauthn.get', challenge: toBase64(challenge), origin: 'conduit.app' })
  );
  const authData = new Uint8Array(37); // minimal authenticator data

  return { r, s, authenticatorData: authData, clientDataJSON: clientData };
}

/** Encode passkey signature as bytes for inclusion in a UserOperation. */
export function encodePasskeySignature(sig: PasskeySignature): `0x${string}` {
  const { r, s, authenticatorData, clientDataJSON } = sig;
  const encoded = Buffer.concat([
    Buffer.from(r),
    Buffer.from(s),
    Buffer.from(authenticatorData),
    Buffer.from(clientDataJSON),
  ]);
  return `0x${encoded.toString('hex')}`;
}
