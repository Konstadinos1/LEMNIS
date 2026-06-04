export interface SmartAccount {
  /** Deterministic CREATE2 address — same across OP-Superchain. */
  address: `0x${string}`;
  /** True once deployed on-chain; false means counterfactual (ERC-6492 sigs still valid). */
  isDeployed: boolean;
  chainId: number;
  /** passkey credential ID, stored in MMKV (non-secret reference only). */
  passkeyCredentialId?: string;
}

export interface TokenBalance {
  token: TokenInfo;
  balance: bigint;
  balanceUsd: number;
}

export interface TokenInfo {
  address: `0x${string}`;
  symbol: string;
  name: string;
  decimals: number;
  chainId: number;
  logoUri?: string;
  isAllowlisted: boolean;
}

export interface Guardian {
  address: `0x${string}`;
  label: string;
  addedAt: number;
}

export interface SessionKey {
  address: `0x${string}`;
  expiresAt: number;
  maxSpendPerTx: bigint;
  maxSpendPerDay: bigint;
  allowedTargets: `0x${string}`[];
}
