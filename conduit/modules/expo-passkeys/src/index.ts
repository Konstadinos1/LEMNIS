import { requireNativeModule } from 'expo-modules-core';

const ExpoPasskeys = requireNativeModule('ExpoPasskeys');

export interface PasskeyCreateResult {
  /** Base64url-encoded credential ID */
  credentialId: string;
  /** Base64url-encoded CBOR-encoded authenticator data */
  authenticatorData: string;
  /** Base64url-encoded DER-encoded COSE public key (P-256 / secp256r1) */
  publicKeyCose: string;
  /** Base64url-encoded client data JSON */
  clientDataJSON: string;
  /** Base64url-encoded raw attestation object */
  attestationObject: string;
}

export interface PasskeySignResult {
  /** Base64url-encoded credential ID */
  credentialId: string;
  /** Base64url-encoded authenticator data */
  authenticatorData: string;
  /** Base64url-encoded client data JSON */
  clientDataJSON: string;
  /** Base64url-encoded DER-encoded ECDSA signature (r, s) over SHA-256(authData || SHA-256(clientDataJSON)) */
  signature: string;
  /** Base64url-encoded user handle (optional) */
  userHandle?: string;
}

/**
 * Create a new passkey credential backed by Secure Enclave (iOS) or
 * StrongBox-backed KeyStore (Android).
 *
 * The private key is generated in hardware and is never extractable.
 * The public key is returned in COSE format for on-chain verification.
 *
 * @param rpId   Relying party identifier (e.g. "conduit.app")
 * @param userId Base64url-encoded user ID (maps to wallet address)
 * @param userName Display name shown in the system passkey dialog
 * @param challenge Base64url-encoded 32-byte random challenge from server
 */
export async function createPasskey(
  rpId: string,
  userId: string,
  userName: string,
  challenge: string
): Promise<PasskeyCreateResult> {
  return ExpoPasskeys.createPasskey(rpId, userId, userName, challenge);
}

/**
 * Sign a challenge with an existing passkey (WebAuthn assertion).
 * Triggers Face ID / Touch ID / biometric prompt.
 *
 * @param rpId         Relying party identifier
 * @param credentialId Base64url-encoded credential ID (from createPasskey)
 * @param challenge    Base64url-encoded 32-byte challenge to sign
 */
export async function signWithPasskey(
  rpId: string,
  credentialId: string,
  challenge: string
): Promise<PasskeySignResult> {
  return ExpoPasskeys.signWithPasskey(rpId, credentialId, challenge);
}

/**
 * Check whether the device supports platform passkeys
 * (Secure Enclave on iOS ≥ 16, StrongBox on Android ≥ 9).
 */
export async function isPasskeySupported(): Promise<boolean> {
  return ExpoPasskeys.isPasskeySupported();
}
