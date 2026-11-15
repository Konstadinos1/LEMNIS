/**
 * Relay WebSocket authentication.
 *
 * The relay (Elixir/Phoenix) verifies a self-signed EdDSA JWT rather than
 * the HMAC JWT issued by the API gateway.  This separates the two auth
 * domains: the API cannot forge relay identities and vice-versa.
 *
 * Token structure (Relay.Auth):
 *   header:  { alg: "EdDSA", typ: "JWT" }
 *   payload: { sub: <fingerprint>, iat, exp, jti }
 *   signature: Ed25519(identity_secret_key, base64url(header).base64url(payload))
 */

import { ed25519SignAsync, toBase64 } from '../crypto/primitives';
import { loadIdentity, getMyFingerprint } from '../crypto/identity';

const JWT_TTL_S = 3600;

function toBase64Url(bytes: Uint8Array): string {
  return toBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function encodeJwtPart(obj: object): string {
  return toBase64Url(new TextEncoder().encode(JSON.stringify(obj)));
}

export async function createRelayJwt(): Promise<string> {
  const identity = await loadIdentity();
  if (!identity) throw new Error('No identity — complete wallet setup first');

  const fingerprint = await getMyFingerprint();
  if (!fingerprint) throw new Error('Could not derive identity fingerprint');

  const now = Math.floor(Date.now() / 1000);
  const header  = encodeJwtPart({ alg: 'EdDSA', typ: 'JWT' });
  const payload = encodeJwtPart({
    sub: fingerprint,
    iat: now,
    exp: now + JWT_TTL_S,
    jti: crypto.randomUUID(),
  });

  const signingInput = `${header}.${payload}`;
  const sig = await ed25519SignAsync(
    new TextEncoder().encode(signingInput),
    identity.identityKeyEd.secretKey,
  );

  return `${signingInput}.${toBase64Url(sig)}`;
}
