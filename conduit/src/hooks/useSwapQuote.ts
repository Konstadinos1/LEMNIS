import { useQuery } from '@tanstack/react-query';
import type { SwapParams, SwapQuote } from '@/types/swap';

const BASE_CHAIN_ID = 8453;

async function fetchQuote(params: SwapParams): Promise<SwapQuote> {
  const url = new URL('/api/swap/quote', process.env.EXPO_PUBLIC_API_BASE_URL);
  url.searchParams.set('chainId', String(BASE_CHAIN_ID));
  url.searchParams.set('sellToken', params.fromToken.address);
  url.searchParams.set('buyToken', params.toToken.address);
  url.searchParams.set('sellAmount', params.fromAmount);
  url.searchParams.set('slippageBps', String(params.slippageBps));

  const res = await fetch(url.toString());
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Quote fetch failed: ${res.status} — ${body}`);
  }
  return res.json() as Promise<SwapQuote>;
}

export function useSwapQuote(params: SwapParams | null) {
  return useQuery({
    queryKey: ['swap-quote', params],
    queryFn: () => fetchQuote(params!),
    enabled:
      params !== null &&
      !!params.fromToken &&
      !!params.toToken &&
      !!params.fromAmount &&
      params.fromAmount !== '0',
    staleTime: 15_000,
    refetchInterval: 15_000,
    retry: 2,
  });
}
