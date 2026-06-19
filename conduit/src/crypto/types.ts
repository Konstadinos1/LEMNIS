/**
 * Interfaces for the Rust native crypto core (exposed via JSI TurboModule).
 * Actual implementation lives in native/crypto/src/lib.rs — these are the
 * TypeScript contracts that the JSI binding must satisfy.
 */

export interface PreKeyBundle {
  identityKey: Uint8Array;    // X25519 public key
  signedPreKey: SignedPreKey;
  kyberPreKey: KyberPreKey;   // ML-KEM-768 public key for PQXDH
  oneTimePreKey?: Uint8Array;
  registrationId: number;
}

export interface SignedPreKey {
  keyId: number;
  publicKey: Uint8Array;
  signature: Uint8Array;  // Ed25519 over publicKey
}

export interface KyberPreKey {
  keyId: number;
  publicKey: Uint8Array;  // ML-KEM-768 encapsulation key
  signature: Uint8Array;
}

export interface DoubleRatchetSession {
  sessionId: string;
  /** Opaque blob returned by the Rust core; never inspected in JS. */
  state: Uint8Array;
}

export interface EncryptedEnvelope {
  ciphertext: Uint8Array;
  messageType: 1 | 2 | 3;  // 1=prekey, 2=normal, 3=senderkey
  registrationId: number;
}

/** JSI TurboModule interface for the Rust crypto core. */
export interface NativeCryptoModule {
  /** Generate a fresh identity + prekey bundle. Returns serialized JSON. */
  generateIdentityBundle(): string;

  /** X3DH + PQXDH session establishment from a remote pre-key bundle. */
  establishSession(remoteBundle: string): string;

  /** Encrypt a plaintext message under an existing session. */
  encryptMessage(sessionId: string, plaintext: Uint8Array): string;

  /** Decrypt a ciphertext envelope. */
  decryptMessage(sessionId: string, envelope: string): Uint8Array;

  /** Ratchet a Sender Key for group use. */
  encryptGroupMessage(senderKeyId: string, plaintext: Uint8Array): string;
  decryptGroupMessage(senderKeyId: string, envelope: string): Uint8Array;

  /** secp256r1 passkey signing (delegates to Secure Enclave / StrongBox). */
  signWithPasskey(credentialId: string, challenge: Uint8Array): string;

  /** EIP-712 typed data hash (keccak256 over structured data). */
  hashTypedData(domainSeparator: string, structHash: string): `0x${string}`;

  /** RLP-encode and hash a UserOperation for 4337 bundler submission. */
  hashUserOperation(userOp: string): `0x${string}`;
}
