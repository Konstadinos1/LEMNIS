import type { FastifyInstance } from 'fastify';

export async function allowlistRouter(app: FastifyInstance) {
  /**
   * GET /api/tokens/allowlist
   * Returns the curated token allowlist for the specified chain.
   * Cached in Redis for 5 minutes; updated by admin ops.
   */
  app.get('/allowlist', async (req, reply) => {
    const chainId = Number((req.query as Record<string, string>).chainId ?? 8453);
    // Fetch from DB / Redis cache — placeholder response:
    return reply.send({
      chainId,
      tokens: [
        { address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', symbol: 'USDC', decimals: 6 },
        { address: '0x60a3E35Cc302bFA44Cb288Bc5a4F316Fdb1adb42', symbol: 'EURC', decimals: 6 },
        { address: '0x4200000000000000000000000000000000000006', symbol: 'WETH', decimals: 18 },
        { address: '0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf', symbol: 'cbBTC', decimals: 8 },
      ],
      updatedAt: Date.now(),
    });
  });
}
