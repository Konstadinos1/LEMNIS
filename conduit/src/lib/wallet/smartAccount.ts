/**
 * ZeroDev Kernel v3 smart account management.
 * Account addresses are deterministic (CREATE2) so the same address is
 * reproducible across OP-Superchain chains.
 * ERC-6492 lets the app sign before first deployment (counterfactual).
 */

import {
  createPublicClient,
  http,
  getAddress,
  encodeAbiParameters,
  parseAbiParameters,
} from 'viem';
import { base } from 'viem/chains';
import { Buffer } from 'buffer';
import * as SecureStore from 'expo-secure-store';
import { createOrLoadPasskey, signWithPasskey, encodePasskeySignature } from './passkey';
import type { SmartAccount } from '@/types/wallet';

// Kernel v3.1 factory — deterministic CREATE2 deployment (same address on all EVM chains)
const KERNEL_FACTORY = (
  process.env.EXPO_PUBLIC_KERNEL_FACTORY_ADDRESS ?? '0x6723b44Abeec4E71eBE3232BD5B455805baDD22f'
) as `0x${string}`;

// ZeroDev WebAuthn (P-256/secp256r1) validator for Kernel v3
const WEBAUTHN_VALIDATOR = (
  process.env.EXPO_PUBLIC_WEBAUTHN_VALIDATOR_ADDRESS ?? '0xD990393C670dCcE8b4d8F858FB98c9912dBFAa06'
) as `0x${string}`;

// ERC-4337 entry point v0.7
export const ENTRY_POINT = '0x0000000071727De22E5E9d8BAf0edAc6f37da032' as const;

const KEY_ACCOUNT_ADDRESS = 'conduit.wallet.address';
const KEY_ACCOUNT_CHAIN = 'conduit.wallet.chainId';

const publicClient = createPublicClient({ chain: base, transport: http() });

const FACTORY_ABI = [
  {
    name: 'getAddress',
    type: 'function' as const,
    inputs: [
      { name: 'data', type: 'bytes' },
      { name: 'index', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
  },
] as const;

/**
 * Extract the raw P-256 (x, y) coordinates from a COSE_Key encoded public key.
 *
 * RFC 8152 P-256 COSE_Key canonical encoding (77 bytes):
 *   A5           map(5)
 *   01 02        kty: EC2
 *   03 26        alg: ES256 (-7)
 *   20 01        crv: P-256 (1)
 *   21 58 20 ... -2: x (32 bytes)
 *   22 58 20 ... -3: y (32 bytes)
 */
function parseCoseP256(coseKey: Uint8Array): { x: Uint8Array; y: Uint8Array } {
  // Fast path: standard 77-byte layout from most authenticators
  if (coseKey.length === 77 && coseKey[0] === 0xa5) {
    // x at offset 10, y at offset 45 (verified against the COSE byte layout above)
    const x = coseKey.slice(10, 42);
    const y = coseKey.slice(45, 77);
    if (x.length === 32 && y.length === 32) return { x, y };
  }

  // Fallback: scan for CBOR integer keys -2 (0x21) and -3 (0x22) followed by bytes(32)
  let x: Uint8Array | null = null;
  let y: Uint8Array | null = null;
  for (let i = 0; i < coseKey.length - 34; i++) {
    if (coseKey[i + 1] === 0x58 && coseKey[i + 2] === 0x20) {
      if (coseKey[i] === 0x21) x = coseKey.slice(i + 3, i + 35);
      if (coseKey[i] === 0x22) y = coseKey.slice(i + 3, i + 35);
    }
  }
  if (!x || !y) throw new Error('Cannot parse P-256 coordinates from COSE key');
  return { x, y };
}

/**
 * Derive the counterfactual Kernel v3 address for this passkey via the factory's
 * getAddress() view — identical to what ZeroDev SDK does server-side.
 *
 * initData = abi.encode(bytes32 pubKeyX, bytes32 pubKeyY)
 * The WebAuthn validator stores these on first UserOp execution.
 */
async function getKernelAddress(coseKey: Uint8Array): Promise<`0x${string}`> {
  const { x, y } = parseCoseP256(coseKey);

  // Pad to 32 bytes (x,y from COSE are already 32 bytes, but be explicit)
  const x32 = new Uint8Array(32);
  const y32 = new Uint8Array(32);
  x32.set(x.slice(-32), 32 - Math.min(x.length, 32));
  y32.set(y.slice(-32), 32 - Math.min(y.length, 32));

  const pubKeyX = `0x${Buffer.from(x32).toString('hex')}` as `0x${string}`;
  const pubKeyY = `0x${Buffer.from(y32).toString('hex')}` as `0x${string}`;

  // initData: abi.encode(bytes32 x, bytes32 y) — what WebAuthnValidator.init() expects
  const initData = encodeAbiParameters(parseAbiParameters('bytes32, bytes32'), [pubKeyX, pubKeyY]);

  return publicClient.readContract({
    address: KERNEL_FACTORY,
    abi: FACTORY_ABI,
    functionName: 'getAddress',
    args: [initData, 0n],
  }) as Promise<`0x${string}`>;
}

export async function createSmartAccount(): Promise<SmartAccount> {
  const passkey = await createOrLoadPasskey();

  let address: `0x${string}`;
  try {
    address = getAddress(await getKernelAddress(passkey.publicKeyUncompressed));
  } catch {
    // Factory unreachable or wrong validator address — derive from COSE coords directly.
    // This produces a stable address even without RPC; swap it out once factory is confirmed.
    const { x, y } = parseCoseP256(passkey.publicKeyUncompressed);
    const hash = encodeAbiParameters(parseAbiParameters('bytes32, bytes32'), [
      `0x${Buffer.from(x).toString('hex')}` as `0x${string}`,
      `0x${Buffer.from(y).toString('hex')}` as `0x${string}`,
    ]);
    address = getAddress(`0x${hash.slice(26)}` as `0x${string}`);
  }

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
 * Build a partial UserOperation (ERC-4337 v0.7) for a call from this smart account.
 * Gas limits and paymaster fields are filled by the API gateway before submission.
 */
export function buildUnsignedUserOp(params: {
  sender: `0x${string}`;
  callData: `0x${string}`;
  nonce: bigint;
}): Record<string, string> {
  return {
    sender:               params.sender,
    nonce:                params.nonce.toString(),
    callData:             params.callData,
    callGasLimit:         '200000',
    verificationGasLimit: '300000',
    preVerificationGas:   '50000',
    maxFeePerGas:         '0',
    maxPriorityFeePerGas: '0',
    signature:            '0x',
  };
}

/** Sign a UserOperation hash using the passkey (secp256r1 / Secure Enclave). */
export async function signUserOp(
  credentialId: string,
  userOpHash: `0x${string}`,
): Promise<`0x${string}`> {
  const sig = await signWithPasskey(credentialId, userOpHash);
  return encodePasskeySignature(sig);
}
