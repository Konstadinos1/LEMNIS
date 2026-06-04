/**
 * Paymaster service — sponsors gas for user operations on Base.
 *
 * Security model:
 * - The paymaster can pay gas for an operation (via Pimlico's verifying paymaster).
 * - It CANNOT authorize the call intent — the smart account's passkey validator
 *   guards that. The paymaster only adds a gas-sponsorship signature.
 * - This service holds a signing key (HSM/KMS-backed in production) for the
 *   paymaster contract. That key has no authority over user funds.
 */

import { http } from 'viem';
import { createPimlicoClient } from 'permissionless/clients/pimlico';
import type { UserOperation } from 'permissionless/types';
import postgres from 'postgres';

const PIMLICO_API_KEY = process.env.PIMLICO_API_KEY
  ?? (() => { throw new Error('PIMLICO_API_KEY required'); })();

// Daily sponsorship cap: max gas units per account per 24h window.
// 50_000_000 gas ≈ $0.50 at Base prices — enough for several swaps.
const DAILY_GAS_LIMIT = BigInt(process.env.DAILY_GAS_LIMIT ?? '50000000');

const pimlicoClient = createPimlicoClient({
  transport: http(`https://api.pimlico.io/v2/base/rpc?apikey=${PIMLICO_API_KEY}`),
  entryPoint: { address: '0x0000000071727De22E5E9d8BAf0edAc6f37da032', version: '0.7' },
});

// Lazy DB connection — initialised on first use, not at import time.
let _sql: ReturnType<typeof postgres> | null = null;
function getDb(): ReturnType<typeof postgres> {
  if (!_sql) {
    const url = process.env.DATABASE_URL
      ?? (() => { throw new Error('DATABASE_URL required'); })();
    _sql = postgres(url, {
      max: 5,
      idle_timeout: 20,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: true } : false,
    });
  }
  return _sql;
}

// ─── Rate limiting ────────────────────────────────────────────────────────────

/**
 * Check whether an account is within the daily sponsorship allowance.
 * Sums gas_used in sponsorship_log for the last 24 hours.
 */
export async function isWithinSponsorshipLimit(accountAddress: string): Promise<boolean> {
  const db = getDb();
  const rows = await db`
    SELECT COALESCE(SUM(gas_used), 0)::bigint AS total_gas
    FROM   sponsorship_log
    WHERE  account_address = ${accountAddress.toLowerCase()}
      AND  sponsored_at >= NOW() - INTERVAL '24 hours'
  `;
  const totalGas = BigInt(rows[0]?.total_gas ?? 0);
  return totalGas < DAILY_GAS_LIMIT;
}

/**
 * Record a successful sponsorship for rate-limiting and abuse detection.
 */
export async function logSponsorship(
  accountAddress: string,
  userOpHash: string,
  gasUsed: bigint,
): Promise<void> {
  const db = getDb();
  await db`
    INSERT INTO sponsorship_log
      (id, account_address, user_op_hash, gas_used, sponsored_at, inserted_at, updated_at)
    VALUES (
      gen_random_uuid(),
      ${accountAddress.toLowerCase()},
      ${userOpHash},
      ${gasUsed.toString()},
      NOW(), NOW(), NOW()
    )
  `;
}

// ─── Pimlico calls ────────────────────────────────────────────────────────────

/**
 * Apply paymaster sponsorship to a UserOperation.
 * Returns the sponsored op and the userOpHash the client must sign.
 */
export async function sponsorUserOperation(userOp: UserOperation<'v0.7'>): Promise<{
  sponsoredOp: UserOperation<'v0.7'>;
  userOpHash: `0x${string}`;
}> {
  const { userOperation: sponsoredOp } = await pimlicoClient.sponsorUserOperation({ userOp });
  const userOpHash = await pimlicoClient.getUserOperationHash({
    userOperation: sponsoredOp,
  }) as `0x${string}`;
  return { sponsoredOp, userOpHash };
}

/**
 * Submit a fully-signed UserOperation to the Pimlico bundler.
 * Returns the on-chain transaction hash once the bundle is included.
 */
export async function submitUserOperation(
  userOp: UserOperation<'v0.7'>,
): Promise<`0x${string}`> {
  return pimlicoClient.sendUserOperation({ userOperation: userOp });
}
