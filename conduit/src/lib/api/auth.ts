/**
 * API session authentication.
 *
 * Flow:
 *  1. POST /auth/challenge { fingerprint } → { challenge }
 *  2. Sign challenge with Ed25519 identity key
 *  3. POST /auth/session { fingerprint, challenge, signature, identityKeyEd } → { token }
 *  4. Store HMAC JWT in SecureStore for subsequent API calls
 *
 * The fingerprint is lowercase_hex(SHA-256(X25519 DH public key)) — the same
 * derivation used by the relay in Relay.Prekeys.derive_fingerprint/1.
 */

import { ed25519SignAsync, toHex } from '../crypto/primitives';
import { loadIdentity, getMyFingerprint } from '../crypto/identity';
import {
  apiFetch,
  saveSessionJwt,
  getSessionJwt,
  jwtIsExpiredOrExpiringSoon,
  registerSessionRefresher,
} from './client';

export async function acquireApiSession(): Promise<string> {
  const identity = await loadIdentity();
  if (!identity) throw new Error('No identity — complete wallet setup first');

  const fingerprint = await getMyFingerprint();
  if (!fingerprint) throw new Error('Could not derive identity fingerprint');

  // Unauthenticated request — apiFetch sends no Bearer header when jwt is null
  const { challenge } = await apiFetch<{ challenge: string }>('/auth/challenge', {
    method: 'POST',
    body: JSON.stringify({ fingerprint }),
  });

  const msgBytes = new TextEncoder().encode(challenge);
  const signature = await ed25519SignAsync(msgBytes, identity.identityKeyEd.secretKey);

  const { token } = await apiFetch<{ token: string }>('/auth/session', {
    method: 'POST',
    body: JSON.stringify({
      fingerprint,
      challenge,
      signature:    toHex(signature),
      identityKeyEd: toHex(identity.identityKeyEd.publicKey),
    }),
  });

  await saveSessionJwt(token);
  // Register 401 auto-refresh so apiFetch can recover transparently.
  // Done here rather than at module-load to guarantee the identity exists first.
  registerSessionRefresher(acquireApiSession);
  return token;
}

/**
 * Return a valid (non-expired) API session JWT.
 * Re-acquires when the stored token is missing, already expired, or expires
 * within the next 60 seconds to avoid a request failing mid-flight.
 */
export async function ensureApiSession(): Promise<string> {
  const existing = await getSessionJwt();
  if (existing && !jwtIsExpiredOrExpiringSoon(existing)) return existing;
  return acquireApiSession();
}
