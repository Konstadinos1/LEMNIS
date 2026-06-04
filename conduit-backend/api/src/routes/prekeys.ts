import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

const BinaryArraySchema = z.array(z.number().int().min(0).max(255));

const RegisterSchema = z.object({
  identityKeyDh: BinaryArraySchema,  // X25519 public key (32 bytes)
  identityKeyEd: BinaryArraySchema,  // Ed25519 public key (32 bytes)
  registrationId: z.number().int(),
  deviceId: z.number().int().default(1),
  signedPreKey: z.object({
    keyId: z.number().int(),
    publicKey: BinaryArraySchema,
    signature: BinaryArraySchema,
  }),
  kyberPreKey: z.object({
    keyId: z.number().int(),
    publicKey: BinaryArraySchema,
    signature: BinaryArraySchema,
  }),
  oneTimePreKeys: z.array(z.object({
    keyId: z.number().int(),
    publicKey: BinaryArraySchema,
  })).max(100),
  pushToken: z.string().optional(),
  pushPlatform: z.enum(['apns', 'fcm']).optional(),
});

export async function prekeysRouter(app: FastifyInstance) {
  /**
   * POST /api/prekeys/register
   * Upload public pre-key material for X3DH/PQXDH session establishment.
   * Only public keys — private keys never leave the device.
   */
  app.post('/register', {
    preHandler: [app.authenticate],
  }, async (req, reply) => {
    const body = RegisterSchema.safeParse(req.body);
    if (!body.success) {
      return reply.status(400).send({ error: 'invalid_body', detail: body.error.flatten() });
    }

    const d = body.data;

    // Relay to the Elixir backend via internal HTTP
    const relayUrl = `${process.env.RELAY_INTERNAL_URL ?? 'http://relay:4000'}/internal/prekeys/register`;
    const res = await fetch(relayUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(d),
    });

    if (!res.ok) {
      req.log.warn({ status: res.status }, 'relay prekey registration failed');
      return reply.status(502).send({ error: 'relay_error' });
    }

    return reply.status(201).send({ ok: true });
  });

  /**
   * GET /api/prekeys/:fingerprint
   * Fetch the pre-key bundle for a peer and consume one one-time pre-key.
   * Fingerprint = hex(SHA-256(X25519 identity key)).
   */
  app.get('/:fingerprint', {
    preHandler: [app.authenticate],
  }, async (req, reply) => {
    const { fingerprint } = req.params as { fingerprint: string };

    if (!/^[0-9a-f]{64}$/.test(fingerprint)) {
      return reply.status(400).send({ error: 'invalid_fingerprint' });
    }

    const relayUrl = `${process.env.RELAY_INTERNAL_URL ?? 'http://relay:4000'}/internal/prekeys/${fingerprint}`;
    const res = await fetch(relayUrl);

    if (res.status === 404) return reply.status(404).send({ error: 'not_found' });
    if (!res.ok) return reply.status(502).send({ error: 'relay_error' });

    return reply.send(await res.json());
  });
}
