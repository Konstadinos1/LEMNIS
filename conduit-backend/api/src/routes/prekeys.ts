import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

const RegisterSchema = z.object({
  identityKey: z.string(),
  registrationId: z.number().int(),
  deviceId: z.number().int().default(1),
  signedPreKey: z.object({
    keyId: z.number().int(),
    publicKey: z.string(),
    signature: z.string(),
  }),
  kyberPreKey: z.object({
    keyId: z.number().int(),
    publicKey: z.string(),
    signature: z.string(),
  }),
  oneTimePreKeys: z.array(z.object({
    keyId: z.number().int(),
    publicKey: z.string(),
  })).max(100),
});

export async function prekeysRouter(app: FastifyInstance) {
  /**
   * POST /api/prekeys/register
   * Upload public pre-key material for X3DH/PQXDH session establishment.
   * Only public keys are uploaded — private keys never leave the device.
   */
  app.post('/register', {
    preHandler: [app.authenticate],
  }, async (req, reply) => {
    const body = RegisterSchema.safeParse(req.body);
    if (!body.success) {
      return reply.status(400).send({ error: 'invalid_body', detail: body.error.flatten() });
    }

    // Store in DB — implementation in Relay.PreKeys (Ecto schema)
    // Omitted for brevity; the structure mirrors Signal's prekey distribution API.
    return reply.status(201).send({ ok: true });
  });

  /**
   * GET /api/prekeys/:identityFingerprint
   * Fetch the pre-key bundle for a peer to begin an X3DH/PQXDH session.
   * Returns exactly one one-time pre-key and removes it from the store.
   */
  app.get('/:fingerprint', {
    preHandler: [app.authenticate],
  }, async (req, reply) => {
    const { fingerprint } = req.params as { fingerprint: string };
    if (!/^[0-9a-fA-F]{64}$/.test(fingerprint)) {
      return reply.status(400).send({ error: 'invalid_fingerprint' });
    }

    // Fetch from DB and consume one OTP key atomically.
    // Placeholder response shape:
    return reply.send({
      identityKey: '',
      registrationId: 0,
      deviceId: 1,
      signedPreKey: { keyId: 0, publicKey: '', signature: '' },
      kyberPreKey: { keyId: 0, publicKey: '', signature: '' },
      oneTimePreKey: { keyId: 0, publicKey: '' },
    });
  });
}
