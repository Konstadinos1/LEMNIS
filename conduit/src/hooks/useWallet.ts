import { useQuery } from '@tanstack/react-query';
import { createPublicClient, http, erc20Abi } from 'viem';
import { base } from 'viem/chains';
import { useWalletStore } from '@/store/wallet';
import type { TokenBalance, TokenInfo } from '@/types/wallet';

// Curated Base mainnet token list — mirrors backend /api/tokens/allowlist
const BASE_TOKENS: Omit<TokenInfo, 'logoUri'>[] = [
  {
    address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    symbol: 'USDC',
    name: 'USD Coin',
    decimals: 6,
    chainId: 8453,
    isAllowlisted: true,
  },
  {
    address: '0x60a3E35Cc302bFA44Cb288Bc5a4F316Fdb1adb42',
    symbol: 'EURC',
    name: 'Euro Coin',
    decimals: 6,
    chainId: 8453,
    isAllowlisted: true,
  },
  {
    address: '0x4200000000000000000000000000000000000006',
    symbol: 'WETH',
    name: 'Wrapped Ether',
    decimals: 18,
    chainId: 8453,
    isAllowlisted: true,
  },
  {
    address: '0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf',
    symbol: 'cbBTC',
    name: 'Coinbase Wrapped BTC',
    decimals: 8,
    chainId: 8453,
    isAllowlisted: true,
  },
];

// Static fallback prices (USD) for when CoinGecko is unreachable
const FALLBACK_PRICES: Record<string, number> = {
  USDC: 1,
  EURC: 1.08,
  WETH: 3200,
  cbBTC: 95000,
};

const COINGECKO_IDS: Record<string, string> = {
  USDC: 'usd-coin',
  EURC: 'euro-coin',
  WETH: 'weth',
  cbBTC: 'coinbase-wrapped-btc',
};

const publicClient = createPublicClient({ chain: base, transport: http() });

async function fetchTokenPrices(): Promise<Record<string, number>> {
  try {
    const ids = Object.values(COINGECKO_IDS).join(',');
    const res = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd`,
      { signal: AbortSignal.timeout(4000) },
    );
    if (!res.ok) return FALLBACK_PRICES;
    const data = await res.json() as Record<string, { usd: number }>;
    const prices: Record<string, number> = {};
    for (const [symbol, cgId] of Object.entries(COINGECKO_IDS)) {
      prices[symbol] = data[cgId]?.usd ?? FALLBACK_PRICES[symbol] ?? 0;
    }
    return prices;
  } catch {
    return FALLBACK_PRICES;
  }
}

/**
 * Fetch ERC-20 balances for all allowlisted tokens via viem multicall.
 * Reads directly from Base RPC — no backend indexer required.
 * Filters out zero balances so the wallet screen stays clean.
 */
async function fetchBalances(address: `0x${string}`): Promise<TokenBalance[]> {
  const [results, prices] = await Promise.all([
    publicClient.multicall({
      contracts: BASE_TOKENS.map((token) => ({
        address: token.address as `0x${string}`,
        abi: erc20Abi,
        functionName: 'balanceOf' as const,
        args: [address],
      })),
      allowFailure: true,
    }),
    fetchTokenPrices(),
  ]);

  return BASE_TOKENS
    .map((token, i) => {
      const result = results[i];
      const balance = result?.status === 'success' ? (result.result as bigint) : 0n;
      const price = prices[token.symbol] ?? 0;
      const balanceUsd = (Number(balance) / 10 ** token.decimals) * price;
      return { token, balance, balanceUsd } satisfies TokenBalance;
    })
    .filter((b) => b.balance > 0n);
}

export function useBalances() {
  const account = useWalletStore((s) => s.account);
  const setBalances = useWalletStore((s) => s.setBalances);

  return useQuery({
    queryKey: ['balances', account?.address],
    queryFn: async () => {
      const balances = await fetchBalances(account!.address as `0x${string}`);
      setBalances(balances);
      return balances;
    },
    enabled: !!account?.address,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}
