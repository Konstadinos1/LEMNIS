/**
 * Permit2 signature-based token allowance.
 * Single approve → Permit2 contract → router, replacing per-token approvals.
 * EIP-712 typed data signed by the smart account.
 */

import { encodeAbiParameters, keccak256, encodePacked, type Address } from 'viem';

// Permit2 on Base
export const PERMIT2_ADDRESS = '0x000000000022D473030F116dDEE9F6B43aC78BA3' as const;

const PERMIT_TRANSFER_FROM_TYPE = [
  { name: 'permitted', type: 'TokenPermissions' },
  { name: 'spender', type: 'address' },
  { name: 'nonce', type: 'uint256' },
  { name: 'deadline', type: 'uint256' },
] as const;

const TOKEN_PERMISSIONS_TYPE = [
  { name: 'token', type: 'address' },
  { name: 'amount', type: 'uint256' },
] as const;

export interface PermitTransferFrom {
  permitted: { token: Address; amount: bigint };
  spender: Address;
  nonce: bigint;
  deadline: bigint;
}

export interface PermitTransferFromData {
  domain: {
    name: string;
    chainId: number;
    verifyingContract: Address;
  };
  types: {
    TokenPermissions: typeof TOKEN_PERMISSIONS_TYPE;
    PermitTransferFrom: typeof PERMIT_TRANSFER_FROM_TYPE;
  };
  values: PermitTransferFrom;
}

export function buildPermit2TypedData(
  tokenAddress: Address,
  amount: bigint,
  spender: Address,
  chainId: number,
  deadline?: bigint
): PermitTransferFromData {
  const nonce = BigInt(`0x${Date.now().toString(16).padStart(16, '0')}`);
  const dl = deadline ?? BigInt(Math.floor(Date.now() / 1000) + 1800); // 30 min

  return {
    domain: {
      name: 'Permit2',
      chainId,
      verifyingContract: PERMIT2_ADDRESS,
    },
    types: {
      TokenPermissions: TOKEN_PERMISSIONS_TYPE,
      PermitTransferFrom: PERMIT_TRANSFER_FROM_TYPE,
    },
    values: {
      permitted: { token: tokenAddress, amount },
      spender,
      nonce,
      deadline: dl,
    },
  };
}
