import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import helmet from '@fastify/helmet';
import authPlugin from './middleware/auth';
import { swapRouter } from './routes/swap';
import { walletRouter } from './routes/wallet';
import { prekeysRouter } from './routes/prekeys';
import { allowlistRouter } from './routes/allowlist';
import { authRouter } from './routes/auth';
import { pushRouter } from './routes/push';

const app = Fastify({
  logger: {
    level: process.env.LOG_LEVEL ?? 'info',
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
  sign: { expiresIn: '1h' },
});

await app.register(rateLimit, {
  global: true,
  max: 120,
  timeWindow: '1 minute',
});

// Register auth decorator (adds app.authenticate)
await app.register(authPlugin);

// Health check — no auth
app.get('/health', async () => ({ ok: true, ts: Date.now() }));

// Routes
await app.register(authRouter, { prefix: '/auth' });
await app.register(swapRouter, { prefix: '/api/swap' });
await app.register(walletRouter, { prefix: '/api/wallet' });
await app.register(prekeysRouter, { prefix: '/api/prekeys' });
await app.register(allowlistRouter, { prefix: '/api/tokens' });
await app.register(pushRouter, { prefix: '/api/push' });

const PORT = Number(process.env.PORT ?? 3000);
await app.listen({ port: PORT, host: '0.0.0.0' });
app.log.info(`API gateway listening on :${PORT}`);
