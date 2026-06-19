import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import fp from 'fastify-plugin';

/**
 * Adds an `app.authenticate` preHandler that verifies the JWT
 * in the Authorization header.
 *
 * Token format: `Bearer <jwt>`
 * The JWT is signed by the client's Ed25519 identity key (same as relay).
 * This route layer verifies the HMAC-SHA256 server-issued session token —
 * a separate shorter-lived token issued after identity verification at /auth/session.
 */
export default fp(async function authPlugin(app: FastifyInstance) {
  app.decorate('authenticate', async function (req: FastifyRequest, reply: FastifyReply) {
    try {
      await req.jwtVerify();
    } catch (err) {
      reply.status(401).send({ error: 'unauthorized', detail: (err as Error).message });
    }
  });
});

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}
