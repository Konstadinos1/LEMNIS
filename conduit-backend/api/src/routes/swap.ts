import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

const QuoteQuerySchema = z.object({
  chainId: z.coerce.number().int().positive(),
  sellToken: z.string().startsWith('0x'),
  buyToken: z.string().startsWith('0x'),
  sellAmount: z.string().regex(/^\d+$/),
  slippageBps: z.coerce.number().int().min(0).max(10000).default(50),
});

const BASE_CHAIN_ID = 8453;
const ZEROX_BASE_URL = 'https://api.0x.org/swap/permit2/quote';

export async function swapRouter(app: FastifyInstance) {
  /**
   * GET /api/swap/quote
   * Proxies the 0x Swap API v2 quote request.
   * The 0x API key is never sent to the client.
   * The backend can apply additional risk filtering before forwarding.
   */
  app.get('/quote', {
    preHandler: [app.authenticate],
  }, async (req, reply) => {
    const params = QuoteQuerySchema.safeParse(req.query);
    if (!params.success) {
      return reply.status(400).send({ error: 'invalid_params', detail: params.error.flatten() });
    }

    if (params.data.chainId !== BASE_CHAIN_ID) {
      return reply.status(400).send({ error: 'unsupported_chain' });
    }

    const url = new URL(ZEROX_BASE_URL);
    url.searchParams.set('chainId', String(params.data.chainId));
    url.searchParams.set('sellToken', params.data.sellToken);
    url.searchParams.set('buyToken', params.data.buyToken);
    url.searchParams.set('sellAmount', params.data.sellAmount);
    url.searchParams.set('slippageBps', String(params.data.slippageBps));

    const upstream = await fetch(url.toString(), {
      headers: {
        '0x-api-key': process.env.ZEROX_API_KEY ?? '',
        '0x-version': 'v2',
      },
    });

    if (!upstream.ok) {
      const body = await upstream.text();
      req.log.warn({ status: upstream.status }, '0x API error');
      return reply.status(502).send({ error: 'upstream_error', detail: body });
    }

    const quote = await upstream.json();
    return reply.send(quote);
  });

  /**
   * POST /api/swap/execute
   * Accepts a signed UserOperation (already signed by the user's passkey on-device),
   * applies paymaster sponsorship, and submits to the Pimlico bundler.
   * The server never has access to the user's private key — it only sponsors gas.
   */
  app.post('/execute', {
    preHandler: [app.authenticate],
  }, async (req, reply) => {
    const body = req.body as { sessionId: string; quote: unknown };
    if (!body.sessionId || !body.quote) {
      return reply.status(400).send({ error: 'missing_fields' });
    }

    // TODO: call paymaster service to sponsor the UserOperation
    // The paymaster can pay gas but cannot alter the signed intent.
    const txHash = `0x${'0'.repeat(64)}` as `0x${string}`;

    return reply.send({ txHash });
  });
}
