/**
 * Full swap execution flow:
 * 1. Fetch 0x Swap API v2 quote (via backend proxy)
 * 2. Build Permit2 typed data + EIP-712 hash
 * 3. Construct UserOperation calldata
 * 4. Request paymaster sponsorship + gas estimates
 * 5. Sign UserOp with passkey
 * 6. Submit to bundler via backend API
 * 7. Return txHash for the SwapReceipt message
 */

import { encodeFunctionData, type Address } from 'viem';
import { buildPermit2TypedData } from './permit2';
import { signUserOp, buildUnsignedUserOp } from '@/lib/wallet/smartAccount';
import { signWithPasskey, encodePasskeySignature } from '@/lib/wallet/passkey';
import type { SwapParams, SwapQuote } from '@/types/swap';
import type { SmartAccount } from '@/types/wallet';

const API = process.env.EXPO_PUBLIC_API_BASE_URL ?? 'https://api.conduit.app';

// Minimal ABI for the 0x swap router calldata
const EXECUTE_SELECTOR = '0x3593564c'; // Uniswap-style execute — router-specific

export async function fetchQuote(
  params: SwapParams,
  chainId = 8453
): Promise<SwapQuote> {
  const url = new URL(`${API}/api/swap/quote`);
  url.searchParams.set('chainId', String(chainId));
  url.searchParams.set('sellToken', params.fromToken.address);
  url.searchParams.set('buyToken', params.toToken.address);
  url.searchParams.set('sellAmount', params.fromAmount);
  url.searchParams.set('slippageBps', String(params.slippageBps));
  if (params.useIntent) url.searchParams.set('intent', '1');

  const res = await fetch(url.toString(), { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`Quote error: ${await res.text()}`);
  return res.json() as Promise<SwapQuote>;
}

export interface ExecuteSwapResult {
  txHash: `0x${string}`;
}

export async function executeSwap(
  account: SmartAccount,
  quote: SwapQuote,
  params: SwapParams
): Promise<ExecuteSwapResult> {
  // 1. Build Permit2 approval for the sell token
  const permit2Data = buildPermit2TypedData(
    params.fromToken.address as Address,
    BigInt(quote.sellAmount),
    quote.to,
    account.chainId
  );

  // 2. The swap calldata from the quote goes directly into the UserOp
  const callData = quote.data;

  // 3. Get current nonce from the smart account
  const nonce = BigInt(Date.now()); // simplification; real impl reads from entry point

  // 4. Build unsigned UserOp
  const unsignedOp = buildUnsignedUserOp({
    sender: account.address,
    callData: callData as `0x${string}`,
    nonce,
  });

  // 5. Send to backend for paymaster sponsorship + gas estimates
  const sponsorRes = await fetch(`${API}/api/swap/execute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userOp: unsignedOp,
      quote,
      permit2: permit2Data,
      accountAddress: account.address,
    }),
  });

  if (!sponsorRes.ok) {
    const err = await sponsorRes.text();
    throw new Error(`Sponsorship failed: ${err}`);
  }

  const { userOpHash, sponsoredOp } = await sponsorRes.json() as {
    userOpHash: `0x${string}`;
    sponsoredOp: Record<string, unknown>;
  };

  // 6. Sign with passkey (secp256r1, Secure Enclave)
  if (!account.passkeyCredentialId) throw new Error('No passkey credential');
  const signature = await signUserOp(account.passkeyCredentialId, userOpHash);

  // 7. Submit signed op
  const submitRes = await fetch(`${API}/api/swap/submit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userOp: { ...sponsoredOp, signature } }),
  });

  if (!submitRes.ok) throw new Error(`Submit failed: ${await submitRes.text()}`);
  const { txHash } = await submitRes.json() as { txHash: `0x${string}` };

  return { txHash };
}
