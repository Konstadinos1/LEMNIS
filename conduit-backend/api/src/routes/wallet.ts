import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createPublicClient, http, erc20Abi, encodeFunctionData, type Address } from 'viem';
import { base } from 'viem/chains';
import type { UserOperation } from 'permissionless/types';
import {
  isWithinSponsorshipLimit,
  logSponsorship,
  sponsorUserOperation,
  submitUserOperation,
} from '../../../paymaster/src/index';

// ─── Schemas ──────────────────────────────────────────────────────────────────

const BalanceQuerySchema = z.object({
  address: z.string().startsWith('0x').length(42),
  chainId: z.coerce.number().int().positive(),
});

const UserOpSchema = z.object({
  sender:               z.string().startsWith('0x'),
  nonce:                z.string(),
  callData:             z.string().startsWith('0x'),
  callGasLimit:         z.string().optional(),
  verificationGasLimit: z.string().optional(),
  preVerificationGas:   z.string().optional(),
  maxFeePerGas:         z.string().optional(),
  maxPriorityFeePerGas: z.string().optional(),
  signature:            z.string().optional(),
  factory:              z.string().optional(),
  factoryData:          z.string().optional(),
  paymaster:            z.string().optional(),
  paymasterData:        z.string().optional(),
  paymasterVerificationGasLimit: z.string().optional(),
  paymasterPostOpGasLimit:       z.string().optional(),
});

const SendBodySchema = z.object({
  userOp:         UserOpSchema,
  tokenAddress:   z.string().startsWith('0x').length(42),
  to:             z.string().startsWith('0x').length(42),
  amount:         z.string().regex(/^\d+$/),
  accountAddress: z.string().startsWith('0x').length(42),
});

const SubmitBodySchema = z.object({
  userOp: UserOpSchema.extend({
    signature:            z.string().startsWith('0x'),
    callGasLimit:         z.string(),
    verificationGasLimit: z.string(),
    preVerificationGas:   z.string(),
    maxFeePerGas:         z.string(),
    maxPriorityFeePerGas: z.string(),
  }),
});

// ─── Base token allowlist for balance reads ────────────────────────────────────

const ALLOWED_TOKENS = [
  { address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', symbol: 'USDC',  name: 'USD Coin',             decimals: 6  },
  { address: '0x60a3E35Cc302bFA44Cb288Bc5a4F316Fdb1adb42', symbol: 'EURC',  name: 'Euro Coin',             decimals: 6  },
  { address: '0x4200000000000000000000000000000000000006', symbol: 'WETH',  name: 'Wrapped Ether',         decimals: 18 },
  { address: '0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf', symbol: 'cbBTC', name: 'Coinbase Wrapped BTC',  decimals: 8  },
] as const;

const publicClient = createPublicClient({ chain: base, transport: http(process.env.BASE_RPC_URL) });

// ─── Routes ───────────────────────────────────────────────────────────────────

export async function walletRouter(app: FastifyInstance) {
  /**
   * GET /api/wallet/balances
   *
   * Returns allowlisted ERC-20 balances via viem multicall on Base.
   * Previously proxied to an external indexer; replaced with direct RPC
   * so no separate indexer service is needed at launch.
   */
  app.get('/balances', { preHandler: [app.authenticate] }, async (req, reply) => {
    const params = BalanceQuerySchema.safeParse(req.query);
    if (!params.success) {
      return reply.status(400).send({ error: 'invalid_params' });
    }
    if (params.data.chainId !== 8453) {
      return reply.status(400).send({ error: 'unsupported_chain' });
    }

    const address = params.data.address as Address;

    try {
      const results = await publicClient.multicall({
        contracts: ALLOWED_TOKENS.map((token) => ({
          address: token.address as Address,
          abi:     erc20Abi,
          functionName: 'balanceOf' as const,
          args:    [address],
        })),
        allowFailure: true,
      });

      const balances = ALLOWED_TOKENS
        .map((token, i) => {
          const result = results[i];
          const balance = result?.status === 'success' ? String(result.result as bigint) : '0';
          return {
            token:      { ...token, chainId: params.data.chainId, isAllowlisted: true },
            balance,
            balanceUsd: 0,  // USD conversion left to client; avoids a price-oracle dependency
          };
        })
        .filter((b) => b.balance !== '0');

      return reply.send(balances);
    } catch (err) {
      req.log.error({ err }, 'multicall balance fetch failed');
      return reply.status(502).send({ error: 'rpc_error' });
    }
  });

  /**
   * POST /api/wallet/send
   *
   * Builds the ERC-20 transfer calldata for the requested amount, applies
   * Pimlico paymaster sponsorship, and returns the unsigned userOpHash.
   * The client then signs with their passkey and calls /api/wallet/submit.
   */
  app.post('/send', { preHandler: [app.authenticate] }, async (req, reply) => {
    const parsed = SendBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'invalid_body', detail: parsed.error.flatten() });
    }

    const { userOp, tokenAddress, to, amount, accountAddress } = parsed.data;

    // Only allow transfers to/from allowlisted tokens to limit paymaster abuse
    const isAllowlisted = ALLOWED_TOKENS.some(
      (t) => t.address.toLowerCase() === tokenAddress.toLowerCase()
    );
    if (!isAllowlisted) {
      return reply.status(400).send({ error: 'token_not_allowlisted' });
    }

    const withinLimit = await isWithinSponsorshipLimit(accountAddress).catch(() => true);
    if (!withinLimit) {
      return reply.status(429).send({ error: 'sponsorship_limit_exceeded' });
    }

    // Inject correct ERC-20 calldata — the client sent an unsigned op with empty callData
    const callData = encodeFunctionData({
      abi:          erc20Abi,
      functionName: 'transfer',
      args:         [to as Address, BigInt(amount)],
    });

    const opWithCallData = { ...userOp, callData } as unknown as UserOperation<'v0.7'>;

    let result: { sponsoredOp: UserOperation<'v0.7'>; userOpHash: `0x${string}` };
    try {
      result = await sponsorUserOperation(opWithCallData);
    } catch (err) {
      req.log.error({ err }, 'sponsorUserOperation failed for send');
      return reply.status(502).send({ error: 'sponsorship_failed', detail: (err as Error).message });
    }

    return reply.send({ userOpHash: result.userOpHash, sponsoredOp: result.sponsoredOp });
  });

  /**
   * POST /api/wallet/submit
   *
   * Accepts a fully-signed UserOperation (from either /send or direct transfer),
   * submits to Pimlico bundler, and returns the on-chain tx hash.
   */
  app.post('/submit', { preHandler: [app.authenticate] }, async (req, reply) => {
    const parsed = SubmitBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'invalid_body', detail: parsed.error.flatten() });
    }

    const typedOp = parsed.data.userOp as unknown as UserOperation<'v0.7'>;

    let txHash: `0x${string}`;
    try {
      txHash = await submitUserOperation(typedOp);
    } catch (err) {
      req.log.error({ err }, 'UserOperation submission failed (wallet/submit)');
      return reply.status(502).send({ error: 'submit_failed', detail: (err as Error).message });
    }

    const gasUsed =
      BigInt(typedOp.callGasLimit ?? '0') +
      BigInt(typedOp.verificationGasLimit ?? '0') +
      BigInt(typedOp.preVerificationGas ?? '0');

    logSponsorship(typedOp.sender, txHash, gasUsed).catch((err) => {
      req.log.error({ err }, 'sponsorship_log write failed');
    });

    return reply.send({ txHash });
  });

  /**
   * GET /api/wallet/tx/:txHash
   * Returns basic on-chain transaction status using the Base public RPC.
   */
  app.get('/tx/:txHash', { preHandler: [app.authenticate] }, async (req, reply) => {
    const { txHash } = req.params as { txHash: string };
    if (!/^0x[0-9a-fA-F]{64}$/.test(txHash)) {
      return reply.status(400).send({ error: 'invalid_tx_hash' });
    }

    try {
      const receipt = await publicClient.getTransactionReceipt({
        hash: txHash as `0x${string}`,
      });
      return reply.send({
        status:      receipt.status === 'success' ? 'confirmed' : 'reverted',
        blockNumber: receipt.blockNumber.toString(),
        gasUsed:     receipt.gasUsed.toString(),
      });
    } catch {
      return reply.status(404).send({ error: 'tx_not_found' });
    }
  });
}
