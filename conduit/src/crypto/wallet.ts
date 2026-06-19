import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import { createPublicClient, http, parseAbi, encodeFunctionData } from 'viem';
import { base } from 'viem/chains';
import type { SmartAccount } from '@/types/wallet';

const PASSKEY_CREDENTIAL_MMKV_KEY = 'conduit.passkey.credentialId';
const ACCOUNT_ADDRESS_KEY = 'conduit.wallet.address';

/**
 * Prompt biometrics before exposing any signing operation.
 * All paths that move funds call this first.
 */
export async function requireBiometric(): Promise<boolean> {
  const result = await LocalAuthentication.authenticateAsync({
    promptMessage: 'Authenticate to sign',
    cancelLabel: 'Cancel',
    disableDeviceFallback: false,
  });
  return result.success;
}

/**
 * Derive the deterministic CREATE2 address for the Kernel v3 smart account
 * using the passkey's secp256r1 public key as the owner.
 *
 * In production this calls the factory contract; here we store the address
 * returned during account creation in SecureStore for fast retrieval.
 */
export async function getAccountAddress(): Promise<`0x${string}` | null> {
  const addr = await SecureStore.getItemAsync(ACCOUNT_ADDRESS_KEY);
  return (addr as `0x${string}`) ?? null;
}

export async function saveAccountAddress(address: `0x${string}`): Promise<void> {
  await SecureStore.setItemAsync(ACCOUNT_ADDRESS_KEY, address);
}

/**
 * Check whether the smart account contract is deployed on-chain.
 * Uses a lightweight `getCode` call — no ABI needed.
 */
export async function isAccountDeployed(address: `0x${string}`): Promise<boolean> {
  const client = createPublicClient({ chain: base, transport: http() });
  const code = await client.getBytecode({ address });
  return !!code && code !== '0x';
}

/**
 * Build the minimal SmartAccount descriptor for use in the wallet store.
 */
export async function loadSmartAccount(): Promise<SmartAccount | null> {
  const address = await getAccountAddress();
  if (!address) return null;

  const isDeployed = await isAccountDeployed(address);
  return {
    address,
    isDeployed,
    chainId: base.id,
  };
}

/**
 * Sign a raw 32-byte challenge with the passkey (secp256r1, Secure Enclave).
 * Delegates to the JSI NativeCryptoModule which calls the platform passkey API.
 */
export async function signChallengeWithPasskey(
  credentialId: string,
  challenge: `0x${string}`
): Promise<string> {
  declare const NativeCrypto: import('./types').NativeCryptoModule;
  const challengeBytes = Buffer.from(challenge.slice(2), 'hex');
  return NativeCrypto.signWithPasskey(credentialId, challengeBytes);
}
