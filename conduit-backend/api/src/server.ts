import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import helmet from '@fastify/helmet';
import { swapRouter } from './routes/swap';
import { walletRouter } from './routes/wallet';
import { prekeysRouter } from './routes/prekeys';
import { allowlistRouter } from './routes/allowlist';

const app = Fastify({
  logger: {
    level: process.env.LOG_LEVEL ?? 'info',
    // Never log message bodies — they are ciphertext and should not appear in logs.
    redact: ['req.body', 'req.headers.authorization'],
  },
});

await app.register(helmet);

await app.register(cors, {
  origin: process.env.CORS_ORIGIN ?? false,
  methods: ['GET', 'POST'],
});

await app.register(jwt, {
  secret: process.env.JWT_SECRET ?? (() => { throw new Error('JWT_SECRET required'); })(),
});

await app.register(rateLimit, {
  global: true,
  max: 120,
  timeWindow: '1 minute',
  redis: undefined, // set in production via redis option
});

// Health check — no auth required
app.get('/health', async () => ({ ok: true, ts: Date.now() }));

// Feature routes
await app.register(swapRouter, { prefix: '/api/swap' });
await app.register(walletRouter, { prefix: '/api/wallet' });
await app.register(prekeysRouter, { prefix: '/api/prekeys' });
await app.register(allowlistRouter, { prefix: '/api/tokens' });

const PORT = Number(process.env.PORT ?? 3000);
await app.listen({ port: PORT, host: '0.0.0.0' });
