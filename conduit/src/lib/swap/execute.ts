/**
 * Full swap execution flow:
 * 1. Fetch 0x Swap API v2 quote (via backend proxy)
 * 2. Build Permit2 typed data
 * 3. Construct UserOperation calldata
 * 4. Request paymaster sponsorship + gas estimates
 * 5. Sign UserOp with passkey (secp256r1, Secure Enclave)
 * 6. Submit to bundler
 * 7. Return txHash for the SwapReceipt message
 */

import { type Address } from 'viem';
import { buildPermit2TypedData } from './permit2';
import { signUserOp, buildUnsignedUserOp } from '@/lib/wallet/smartAccount';
import { apiPost } from '@/lib/api/client';
import type { SwapParams, SwapQuote } from '@/types/swap';
import type { SmartAccount } from '@/types/wallet';

export interface ExecuteSwapResult {
  txHash: `0x${string}`;
}

export async function executeSwap(
  account: SmartAccount,
  quote: SwapQuote,
  params: SwapParams,
): Promise<ExecuteSwapResult> {
  // 1. Build Permit2 approval typed data for the sell token
  const permit2Data = buildPermit2TypedData(
    params.fromToken.address as Address,
    BigInt(quote.sellAmount),
    quote.to,
    account.chainId,
  );

  // 2. Nonce — real impl reads from the EntryPoint; timestamp is a monotone placeholder
  const nonce = BigInt(Date.now());

  // 3. Build unsigned UserOp with the quote calldata
  const unsignedOp = buildUnsignedUserOp({
    sender:   account.address,
    callData: quote.data as `0x${string}`,
    nonce,
  });

  // 4. Paymaster sponsorship — backend injects gas limits and paymasterAndData
  const { userOpHash, sponsoredOp } = await apiPost<{
    userOpHash: `0x${string}`;
    sponsoredOp: Record<string, string>;
  }>('/api/swap/execute', {
    userOp:         unsignedOp,
    quote,
    permit2:        permit2Data,
    accountAddress: account.address,
  });

  // 5. Sign with passkey (triggers Face ID / fingerprint)
  if (!account.passkeyCredentialId) throw new Error('No passkey credential');
  const signature = await signUserOp(account.passkeyCredentialId, userOpHash);

  // 6. Submit signed UserOp
  const { txHash } = await apiPost<{ txHash: `0x${string}` }>('/api/swap/submit', {
    userOp: { ...sponsoredOp, signature },
  });

  return { txHash };
}
