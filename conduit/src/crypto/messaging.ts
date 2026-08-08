import type { EncryptedEnvelope, PreKeyBundle, DoubleRatchetSession } from './types';

/**
 * Thin JS wrapper around the JSI NativeCryptoModule.
 * All heavy work (X3DH, PQXDH, Double Ratchet, AES-GCM) runs in the Rust
 * native library on a native thread — never on the JS or UI thread.
 */

declare const NativeCrypto: import('./types').NativeCryptoModule;

export async function establishSessionWithBundle(
  remoteBundle: PreKeyBundle
): Promise<DoubleRatchetSession> {
  const raw = NativeCrypto.establishSession(JSON.stringify(remoteBundle));
  return JSON.parse(raw) as DoubleRatchetSession;
}

export async function encryptMessage(
  session: DoubleRatchetSession,
  plaintext: string
): Promise<EncryptedEnvelope> {
  const bytes = new TextEncoder().encode(plaintext);
  const raw = NativeCrypto.encryptMessage(session.sessionId, bytes);
  return JSON.parse(raw) as EncryptedEnvelope;
}

export async function decryptMessage(
  session: DoubleRatchetSession,
  envelope: EncryptedEnvelope
): Promise<string> {
  const bytes = NativeCrypto.decryptMessage(
    session.sessionId,
    JSON.stringify(envelope)
  );
  return new TextDecoder().decode(bytes);
}

export async function encryptGroupMessage(
  senderKeyId: string,
  plaintext: string
): Promise<string> {
  const bytes = new TextEncoder().encode(plaintext);
  return NativeCrypto.encryptGroupMessage(senderKeyId, bytes);
}

export async function decryptGroupMessage(
  senderKeyId: string,
  envelope: string
): Promise<string> {
  const bytes = NativeCrypto.decryptGroupMessage(senderKeyId, envelope);
  return new TextDecoder().decode(bytes);
}
