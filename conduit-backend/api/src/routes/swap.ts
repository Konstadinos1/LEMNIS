import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { UserOperation } from 'permissionless/types';
import {
  isWithinSponsorshipLimit,
  logSponsorship,
  sponsorUserOperation,
  submitUserOperation,
} from '../../../paymaster/src/index';

// ─── Schemas ──────────────────────────────────────────────────────────────────

const QuoteQuerySchema = z.object({
  chainId:     z.coerce.number().int().positive(),
  sellToken:   z.string().startsWith('0x'),
  buyToken:    z.string().startsWith('0x'),
  sellAmount:  z.string().regex(/^\d+$/),
  slippageBps: z.coerce.number().int().min(0).max(10000).default(50),
});

// Mirrors permissionless UserOperation<'v0.7'> fields as strings (JSON-serialised bigints)
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

const ExecuteBodySchema = z.object({
  userOp:         UserOpSchema,
  quote:          z.record(z.unknown()),
  permit2:        z.record(z.unknown()).optional(),
  accountAddress: z.string().startsWith('0x'),
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

const BASE_CHAIN_ID = 8453;
const ZEROX_BASE_URL = 'https://api.0x.org/swap/permit2/quote';

// ─── Routes ───────────────────────────────────────────────────────────────────

export async function swapRouter(app: FastifyInstance) {
  /**
   * GET /api/swap/quote
   * Proxies 0x Swap API v2 — the API key stays server-side.
   */
  app.get('/quote', { preHandler: [app.authenticate] }, async (req, reply) => {
    const params = QuoteQuerySchema.safeParse(req.query);
    if (!params.success) {
      return reply.status(400).send({ error: 'invalid_params', detail: params.error.flatten() });
    }
    if (params.data.chainId !== BASE_CHAIN_ID) {
      return reply.status(400).send({ error: 'unsupported_chain' });
    }

    const url = new URL(ZEROX_BASE_URL);
    url.searchParams.set('chainId',     String(params.data.chainId));
    url.searchParams.set('sellToken',   params.data.sellToken);
    url.searchParams.set('buyToken',    params.data.buyToken);
    url.searchParams.set('sellAmount',  params.data.sellAmount);
    url.searchParams.set('slippageBps', String(params.data.slippageBps));

    const upstream = await fetch(url.toString(), {
      headers: { '0x-api-key': process.env.ZEROX_API_KEY ?? '', '0x-version': 'v2' },
    });

    if (!upstream.ok) {
      req.log.warn({ status: upstream.status }, '0x API error');
      return reply.status(502).send({ error: 'upstream_error', detail: await upstream.text() });
    }

    return reply.send(await upstream.json());
  });

  /**
   * POST /api/swap/execute
   *
   * Accepts the *unsigned* UserOperation from the client, applies Pimlico
   * paymaster sponsorship + gas estimates, and returns:
   *   { userOpHash, sponsoredOp }
   *
   * The client then signs `userOpHash` with their passkey (Secure Enclave /
   * StrongBox) and sends the result to /api/swap/submit.
   *
   * Non-custodial invariant: the server adds gas sponsorship but cannot alter
   * the signed intent and has no access to the passkey.
   */
  app.post('/execute', { preHandler: [app.authenticate] }, async (req, reply) => {
    const parsed = ExecuteBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'invalid_body', detail: parsed.error.flatten() });
    }

    const { userOp, accountAddress } = parsed.data;

    const withinLimit = await isWithinSponsorshipLimit(accountAddress).catch((err) => {
      req.log.error({ err }, 'sponsorship limit check failed — failing open');
      return true;
    });
    if (!withinLimit) {
      return reply.status(429).send({
        error: 'sponsorship_limit_exceeded',
        message: 'Daily gas sponsorship limit reached.',
      });
    }

    let result: { sponsoredOp: UserOperation<'v0.7'>; userOpHash: `0x${string}` };
    try {
      result = await sponsorUserOperation(userOp as unknown as UserOperation<'v0.7'>);
    } catch (err) {
      req.log.error({ err }, 'Pimlico sponsorUserOperation failed');
      return reply.status(502).send({
        error: 'sponsorship_failed',
        detail: err instanceof Error ? err.message : 'bundler error',
      });
    }

    return reply.send({ userOpHash: result.userOpHash, sponsoredOp: result.sponsoredOp });
  });

  /**
   * POST /api/swap/submit
   *
   * Accepts the sponsored UserOperation with the passkey signature already
   * applied, submits it to the Pimlico bundler, and returns the tx hash.
   * Logs gas usage to sponsorship_log for rate-limiting.
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
      req.log.error({ err }, 'UserOperation submission failed');
      return reply.status(502).send({
        error: 'submit_failed',
        detail: err instanceof Error ? err.message : 'bundler error',
      });
    }

    // Log gas asynchronously — don't block the response
    const gasUsed = BigInt(typedOp.callGasLimit ?? '0')
      + BigInt(typedOp.verificationGasLimit ?? '0')
      + BigInt(typedOp.preVerificationGas ?? '0');

    logSponsorship(typedOp.sender, txHash, gasUsed).catch((err) => {
      req.log.error({ err }, 'sponsorship_log write failed');
    });

    return reply.send({ txHash });
  });
}
