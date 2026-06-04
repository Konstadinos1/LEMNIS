/**
 * ZeroDev Kernel v3 smart account management.
 * Account addresses are deterministic (CREATE2) so the same address is
 * reproducible across OP-Superchain chains.
 * ERC-6492 lets the app sign before first deployment (counterfactual).
 */

import { createPublicClient, http, getAddress, keccak256, encodePacked } from 'viem';
import { base } from 'viem/chains';
import * as SecureStore from 'expo-secure-store';
import { createOrLoadPasskey, signWithPasskey, encodePasskeySignature } from './passkey';
import type { SmartAccount } from '@/types/wallet';

// Kernel v3 factory on Base (mainnet)
const KERNEL_FACTORY = '0x5de4839a76cf55d0c90e2061ef4386d962E15ae3' as const;
// ERC-4337 entry point v0.7
const ENTRY_POINT = '0x0000000071727De22E5E9d8BAf0edAc6f37da032' as const;

const KEY_ACCOUNT_ADDRESS = 'conduit.wallet.address';
const KEY_ACCOUNT_CHAIN = 'conduit.wallet.chainId';

const publicClient = createPublicClient({ chain: base, transport: http() });

export async function createSmartAccount(): Promise<SmartAccount> {
  const passkey = await createOrLoadPasskey();

  // Derive deterministic address from the passkey public key using CREATE2.
  // Full implementation calls the Kernel v3 factory's getAddress() view function.
  // Here we derive a stable address from the public key hash as a placeholder.
  const addrBytes = keccak256(
    encodePacked(['bytes65'], [passkey.publicKeyHex as `0x${string}`])
  );
  const address = getAddress(`0x${addrBytes.slice(26)}`) as `0x${string}`;

  await SecureStore.setItemAsync(KEY_ACCOUNT_ADDRESS, address);
  await SecureStore.setItemAsync(KEY_ACCOUNT_CHAIN, String(base.id));

  const isDeployed = await isAccountOnChain(address);

  return { address, isDeployed, chainId: base.id, passkeyCredentialId: passkey.credentialId };
}

export async function loadSmartAccount(): Promise<SmartAccount | null> {
  const address = await SecureStore.getItemAsync(KEY_ACCOUNT_ADDRESS);
  const chainId = await SecureStore.getItemAsync(KEY_ACCOUNT_CHAIN);
  if (!address || !chainId) return null;

  const isDeployed = await isAccountOnChain(address as `0x${string}`);
  const passkey = await import('./passkey').then((m) => m.loadPasskeyCredential());

  return {
    address: address as `0x${string}`,
    isDeployed,
    chainId: Number(chainId),
    passkeyCredentialId: passkey?.credentialId,
  };
}

export async function isAccountOnChain(address: `0x${string}`): Promise<boolean> {
  try {
    const code = await publicClient.getBytecode({ address });
    return !!code && code !== '0x';
  } catch {
    return false;
  }
}

/**
 * Build a partial UserOperation for a call from this smart account.
 * Paymaster data, signature, and gas estimates are filled in by the
 * API gateway / paymaster service before submission.
 */
export function buildUnsignedUserOp(params: {
  sender: `0x${string}`;
  callData: `0x${string}`;
  nonce: bigint;
}): Record<string, unknown> {
  return {
    sender: params.sender,
    nonce: params.nonce,
    initCode: '0x',  // '0x' once deployed; factory calldata otherwise
    callData: params.callData,
    callGasLimit: 200_000n,
    verificationGasLimit: 300_000n,
    preVerificationGas: 50_000n,
    maxFeePerGas: 0n,         // filled by paymaster service
    maxPriorityFeePerGas: 0n, // filled by paymaster service
    paymasterAndData: '0x',   // filled by paymaster service
    signature: '0x',
  };
}

/** Sign a UserOperation hash using the passkey (secp256r1). */
export async function signUserOp(
  credentialId: string,
  userOpHash: `0x${string}`
): Promise<`0x${string}`> {
  const sig = await signWithPasskey(credentialId, userOpHash);
  return encodePasskeySignature(sig);
}
