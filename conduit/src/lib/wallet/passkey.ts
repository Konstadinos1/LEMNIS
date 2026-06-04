import * as SecureStore from 'expo-secure-store';
import { Buffer } from 'buffer';
import {
  createPasskey as nativeCreatePasskey,
  signWithPasskey as nativeSignWithPasskey,
  isPasskeySupported,
} from 'expo-passkeys';

const RP_ID_DEFAULT = 'conduit.app';
const KEY_PASSKEY_ID  = 'conduit.passkey.credentialId';
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

/** Create (or retrieve existing) passkey credential backed by Secure Enclave / StrongBox. */
export async function createOrLoadPasskey(
  rpId = RP_ID_DEFAULT,
  userName = 'Conduit Wallet',
): Promise<PasskeyCredential> {
  const existing = await loadPasskeyCredential();
  if (existing) return existing;

  const supported = await isPasskeySupported();
  if (!supported) throw new Error('Passkeys not supported on this device (requires iOS 16+ or Android 9+)');

  // userId = base64url(sha256(rpId + userName)) — stable, not a real user identifier
  const userIdBytes = Buffer.from(`${rpId}:${userName}`);
  const userId = userIdBytes.toString('base64url');

  // 32-byte random challenge (server would supply this in production)
  const challengeBytes = new Uint8Array(32);
  crypto.getRandomValues(challengeBytes);
  const challenge = Buffer.from(challengeBytes).toString('base64url');

  const result = await nativeCreatePasskey(rpId, userId, userName, challenge);

  // The public key in COSE format is returned as attestationObject;
  // for on-chain use we store the credentialId and raw COSE-encoded public key.
  const cred: PasskeyCredential = {
    credentialId: result.credentialId,
    publicKeyUncompressed: base64urlToUint8Array(result.publicKeyCose),
    publicKeyHex: Buffer.from(base64urlToUint8Array(result.publicKeyCose)).toString('hex'),
  };

  await SecureStore.setItemAsync(KEY_PASSKEY_ID, cred.credentialId, {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
  await SecureStore.setItemAsync(KEY_PASSKEY_PUB, cred.publicKeyHex, {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });

  return cred;
}

export async function loadPasskeyCredential(): Promise<PasskeyCredential | null> {
  const [credentialId, pubHex] = await Promise.all([
    SecureStore.getItemAsync(KEY_PASSKEY_ID),
    SecureStore.getItemAsync(KEY_PASSKEY_PUB),
  ]);
  if (!credentialId || !pubHex) return null;
  return {
    credentialId,
    publicKeyUncompressed: new Uint8Array(Buffer.from(pubHex, 'hex')),
    publicKeyHex: pubHex,
  };
}

/**
 * Sign a 32-byte challenge with the passkey — triggers Face ID / Touch ID.
 * Returns (r, s) parsed from the WebAuthn assertion signature.
 */
export async function signWithPasskey(
  credentialId: string,
  challengeHex: `0x${string}`,
): Promise<PasskeySignature> {
  const challengeBytes = Buffer.from(challengeHex.slice(2), 'hex');
  const challenge = challengeBytes.toString('base64url');
  const rpId = RP_ID_DEFAULT;

  const result = await nativeSignWithPasskey(rpId, credentialId, challenge);

  const authenticatorData = base64urlToUint8Array(result.authenticatorData);
  const clientDataJSON    = base64urlToUint8Array(result.clientDataJSON);
  const sigDer            = base64urlToUint8Array(result.signature);

  const { r, s } = parseDerSignature(sigDer);
  return { r, s, authenticatorData, clientDataJSON };
}

/** Encode passkey signature as bytes for UserOperation (Kernel v3 WebAuthn validator). */
export function encodePasskeySignature(sig: PasskeySignature): `0x${string}` {
  const { r, s, authenticatorData, clientDataJSON } = sig;
  // Layout expected by ZeroDev Kernel WebAuthn validator:
  // [r(32)][s(32)][authDataLen(2)][authData][clientDataLen(2)][clientData]
  const authDataLen = Buffer.alloc(2);
  authDataLen.writeUInt16BE(authenticatorData.length);
  const clientDataLen = Buffer.alloc(2);
  clientDataLen.writeUInt16BE(clientDataJSON.length);

  const encoded = Buffer.concat([
    Buffer.from(r),
    Buffer.from(s),
    authDataLen,
    Buffer.from(authenticatorData),
    clientDataLen,
    Buffer.from(clientDataJSON),
  ]);
  return `0x${encoded.toString('hex')}`;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function base64urlToUint8Array(b64url: string): Uint8Array {
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
  const padded = b64.padEnd(b64.length + (4 - (b64.length % 4)) % 4, '=');
  return new Uint8Array(Buffer.from(padded, 'base64'));
}

/** Parse DER-encoded ECDSA signature into (r, s) as 32-byte big-endian. */
function parseDerSignature(der: Uint8Array): { r: Uint8Array; s: Uint8Array } {
  // DER: 0x30 [total-len] 0x02 [r-len] [r] 0x02 [s-len] [s]
  let offset = 2; // skip 0x30 and total length
  if (der[offset] !== 0x02) throw new Error('Invalid DER signature');
  const rLen = der[offset + 1]!;
  offset += 2;
  const rRaw = der.slice(offset, offset + rLen);
  offset += rLen;
  if (der[offset] !== 0x02) throw new Error('Invalid DER signature');
  const sLen = der[offset + 1]!;
  offset += 2;
  const sRaw = der.slice(offset, offset + sLen);

  return {
    r: padTo32(rRaw),
    s: padTo32(sRaw),
  };
}

function padTo32(bytes: Uint8Array): Uint8Array {
  // Strip leading zero padding that DER adds for sign bit, then left-pad to 32
  let start = 0;
  while (start < bytes.length - 1 && bytes[start] === 0) start++;
  const stripped = bytes.slice(start);
  const out = new Uint8Array(32);
  out.set(stripped, 32 - stripped.length);
  return out;
}
