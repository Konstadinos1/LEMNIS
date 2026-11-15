/**
 * /auth — Session token issuance.
 * The client proves ownership of its Ed25519 identity key, then receives a
 * short-lived HMAC-SHA256 JWT for API calls.
 *
 * This keeps the relay (Ed25519-verified) and the API gateway (HMAC JWT)
 * auth layers cleanly separated — neither can impersonate the other.
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createVerify } from 'crypto';

const ChallengeSchema = z.object({
  fingerprint: z.string().length(64).regex(/^[0-9a-f]+$/),
});

const SessionSchema = z.object({
  fingerprint: z.string().length(64),
  challenge: z.string(),
  signature: z.string(),  // hex Ed25519 signature over challenge
  identityKeyEd: z.string(), // hex Ed25519 public key (32 bytes)
});

// In-memory challenge store (use Redis in production with TTL)
const pendingChallenges = new Map<string, { challenge: string; expiresAt: number }>();

export async function authRouter(app: FastifyInstance) {
  /**
   * POST /auth/challenge
   * Issue a nonce for the client to sign with its identity key.
   */
  app.post('/challenge', async (req, reply) => {
    const body = ChallengeSchema.safeParse(req.body);
    if (!body.success) return reply.status(400).send({ error: 'invalid_body' });

    const challenge = `conduit-auth:${crypto.randomUUID()}`;
    pendingChallenges.set(body.data.fingerprint, {
      challenge,
      expiresAt: Date.now() + 60_000, // 60s TTL
    });

    return reply.send({ challenge });
  });

  /**
   * POST /auth/session
   * Verify the Ed25519 signature over the challenge and issue a session JWT.
   */
  app.post('/session', async (req, reply) => {
    const body = SessionSchema.safeParse(req.body);
    if (!body.success) return reply.status(400).send({ error: 'invalid_body' });

    const pending = pendingChallenges.get(body.data.fingerprint);
    if (!pending || pending.expiresAt < Date.now()) {
      return reply.status(401).send({ error: 'challenge_expired_or_not_found' });
    }

    pendingChallenges.delete(body.data.fingerprint);

    // Verify Ed25519 signature
    try {
      const pubKeyBytes = Buffer.from(body.data.identityKeyEd, 'hex');
      const sigBytes = Buffer.from(body.data.signature, 'hex');
      const msgBytes = Buffer.from(pending.challenge, 'utf8');

      // Node.js crypto Ed25519 verify
      const valid = verifyEd25519(pubKeyBytes, sigBytes, msgBytes);
      if (!valid) return reply.status(401).send({ error: 'invalid_signature' });
    } catch {
      return reply.status(401).send({ error: 'verification_error' });
    }

    // Issue session JWT
    const token = app.jwt.sign({
      sub: body.data.fingerprint,
      type: 'session',
    });

    return reply.send({ token });
  });
}

function verifyEd25519(pubKey: Buffer, sig: Buffer, msg: Buffer): boolean {
  try {
    const verifier = createVerify('ed25519');
    // Node's Ed25519 key import for raw 32-byte key
    const keyObj = {
      key: pubKey,
      format: 'raw' as const,
      type: 'public' as const,
    };
    // @ts-expect-error — raw key format for Ed25519 in Node 22
    return verifier.verify(keyObj, sig);
  } catch {
    return false;
  }
}
