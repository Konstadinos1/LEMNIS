import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

const BalanceQuerySchema = z.object({
  address: z.string().startsWith('0x').length(42),
  chainId: z.coerce.number().int().positive(),
});

export async function walletRouter(app: FastifyInstance) {
  /**
   * GET /api/wallet/balances
   * Returns allowlisted token balances for a public address.
   * The indexer resolves on-chain data; the relay never correlates this
   * address with any conversation or messaging identity.
   */
  app.get('/balances', {
    preHandler: [app.authenticate],
  }, async (req, reply) => {
    const params = BalanceQuerySchema.safeParse(req.query);
    if (!params.success) {
      return reply.status(400).send({ error: 'invalid_params' });
    }

    // Delegate to the chain indexer service (Ponder / Subsquid).
    // The indexer is a separate process — no shared auth context with the relay.
    const indexerUrl = new URL(
      `/balances/${params.data.address}/${params.data.chainId}`,
      process.env.INDEXER_BASE_URL ?? 'http://localhost:4001'
    );

    const upstream = await fetch(indexerUrl.toString());
    if (!upstream.ok) {
      req.log.warn({ address: params.data.address }, 'indexer error');
      return reply.status(502).send({ error: 'indexer_error' });
    }

    return reply.send(await upstream.json());
  });

  /**
   * GET /api/wallet/tx/:txHash
   * Returns the status of a single transaction (public on-chain data).
   * The client resolves this locally for the tx-status pill; this endpoint
   * is provided as a fallback for RPC failures.
   */
  app.get('/tx/:txHash', async (req, reply) => {
    const { txHash } = req.params as { txHash: string };
    if (!/^0x[0-9a-fA-F]{64}$/.test(txHash)) {
      return reply.status(400).send({ error: 'invalid_tx_hash' });
    }

    const indexerUrl = new URL(
      `/tx/${txHash}`,
      process.env.INDEXER_BASE_URL ?? 'http://localhost:4001'
    );
    const upstream = await fetch(indexerUrl.toString());
    return reply.send(await upstream.json());
  });
}
