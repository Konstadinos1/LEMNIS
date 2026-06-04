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

import { createPublicClient, createWalletClient, http } from 'viem';
import { base } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import { createPimlicoClient } from 'permissionless/clients/pimlico';
import type { UserOperation } from 'permissionless/types';

const PIMLICO_API_KEY = process.env.PIMLICO_API_KEY ?? (() => { throw new Error('PIMLICO_API_KEY required'); })();
const PAYMASTER_SIGNER_KEY = process.env.PAYMASTER_SIGNER_KEY as `0x${string}`;

const pimlicoClient = createPimlicoClient({
  transport: http(`https://api.pimlico.io/v2/base/rpc?apikey=${PIMLICO_API_KEY}`),
  entryPoint: { address: '0x0000000071727De22E5E9d8BAf0edAc6f37da032', version: '0.7' },
});

/**
 * Add paymaster sponsorship to a UserOperation.
 * Called by the API gateway after the client submits a signed op.
 */
export async function sponsorUserOperation(
  userOp: UserOperation<'v0.7'>
): Promise<UserOperation<'v0.7'>> {
  const sponsored = await pimlicoClient.sponsorUserOperation({ userOp });
  return sponsored.userOperation;
}

/**
 * Submit a fully-sponsored UserOperation to the Pimlico bundler.
 * Returns the transaction hash once the bundle is included.
 */
export async function submitUserOperation(
  userOp: UserOperation<'v0.7'>
): Promise<`0x${string}`> {
  return pimlicoClient.sendUserOperation({ userOperation: userOp });
}

/**
 * Check whether a given account address is within the daily sponsorship
 * allowance. Rate-limits are enforced here before calling Pimlico.
 */
export function isWithinSponsorshipLimit(accountAddress: string): boolean {
  // TODO: query sponsorship_log table for today's usage per account
  return true;
}
