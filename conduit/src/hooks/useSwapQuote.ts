import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api/client';
import type { SwapParams, SwapQuote } from '@/types/swap';

const BASE_CHAIN_ID = 8453;

async function fetchQuote(params: SwapParams): Promise<SwapQuote> {
  const qs = new URLSearchParams({
    chainId:    String(BASE_CHAIN_ID),
    sellToken:  params.fromToken.address,
    buyToken:   params.toToken.address,
    sellAmount: params.fromAmount,
    slippageBps: String(params.slippageBps),
  });
  return apiFetch<SwapQuote>(`/api/swap/quote?${qs}`);
}

export function useSwapQuote(params: SwapParams | null) {
  return useQuery({
    queryKey: ['swap-quote', params],
    queryFn:  () => fetchQuote(params!),
    enabled:
      params !== null &&
      !!params.fromToken &&
      !!params.toToken &&
      !!params.fromAmount &&
      params.fromAmount !== '0',
    staleTime:       15_000,
    refetchInterval: 15_000,
    retry: 2,
  });
}
