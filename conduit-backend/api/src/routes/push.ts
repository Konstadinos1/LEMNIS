/**
 * /api/push — Device push-token registration.
 *
 * Each identity registers its FCM/APNs token alongside a 32-byte
 * preview key (AES-256).  The relay uses the preview key to encrypt
 * a short notification preview so the NSE / FCM worker can display
 * meaningful text without access to the Double Ratchet session.
 *
 * The preview key is NOT the message key — it is semi-static
 * (monthly rotation) and intentionally server-readable so that
 * the relay can fan out encrypted previews to offline devices.
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { sql } from '../db';

const RegisterBody = z.object({
  push_token: z.string().min(10).max(4096),
  platform: z.enum(['ios', 'android']),
  // base64-encoded 32-byte AES-256 key  (std base64, may have padding)
  preview_key: z.string().min(40).max(64),
});

const UnregisterBody = z.object({
  push_token: z.string().min(10).max(4096),
});

export async function pushRouter(app: FastifyInstance) {
  /**
   * POST /api/push/register
   * Store (or update) the push token and preview key for the authenticated
   * messaging identity.  The JWT sub is the identity fingerprint.
   */
  app.post('/register', {
    onRequest: [app.authenticate],
  }, async (req, reply) => {
    const body = RegisterBody.safeParse(req.body);
    if (!body.success) {
      return reply.status(400).send({ error: 'invalid_body', details: body.error.flatten() });
    }

    const fingerprint = (req.user as { sub: string }).sub;
    const { push_token, platform, preview_key } = body.data;

    // Upsert: update existing identity row with token + preview key.
    // The identity row is created during key bundle upload (prekeys route).
    const result = await sql`
      UPDATE identities
      SET    push_token    = ${push_token},
             push_platform = ${platform},
             preview_key   = decode(${preview_key}, 'base64'),
             updated_at    = now()
      WHERE  fingerprint   = ${fingerprint}
      RETURNING id
    `;

    if (result.count === 0) {
      // Identity not yet registered — accept gracefully; client should upload
      // prekey bundle first, but do not block token registration.
      await sql`
        INSERT INTO identities
          (id, fingerprint, registration_id, device_id,
           push_token, push_platform, preview_key,
           inserted_at, updated_at)
        VALUES (
          gen_random_uuid(),
          ${fingerprint},
          0,
          1,
          ${push_token},
          ${platform},
          decode(${preview_key}, 'base64'),
          now(),
          now()
        )
        ON CONFLICT (fingerprint) DO UPDATE
          SET push_token    = EXCLUDED.push_token,
              push_platform = EXCLUDED.push_platform,
              preview_key   = EXCLUDED.preview_key,
              updated_at    = now()
      `;
    }

    return reply.send({ ok: true });
  });

  /**
   * POST /api/push/unregister
   * Remove the push token for the authenticated identity (e.g. on sign-out).
   */
  app.post('/unregister', {
    onRequest: [app.authenticate],
  }, async (req, reply) => {
    const body = UnregisterBody.safeParse(req.body);
    if (!body.success) {
      return reply.status(400).send({ error: 'invalid_body' });
    }

    const fingerprint = (req.user as { sub: string }).sub;

    await sql`
      UPDATE identities
      SET    push_token  = NULL,
             push_platform = NULL,
             updated_at  = now()
      WHERE  fingerprint = ${fingerprint}
        AND  push_token  = ${body.data.push_token}
    `;

    return reply.send({ ok: true });
  });
}
