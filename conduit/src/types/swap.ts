import type { TokenInfo } from './wallet';

export type SwapState =
  | 'idle'
  | 'fetching_quote'
  | 'quote_ready'
  | 'simulating'
  | 'awaiting_signature'
  | 'broadcasting'
  | 'pending_settlement'
  | 'settled'
  | 'error';

export interface SwapQuote {
  /** 0x Swap API v2 quote response (subset) */
  sellToken: string;
  buyToken: string;
  sellAmount: string;
  buyAmount: string;
  /** Worst-case output after slippage. */
  minBuyAmount: string;
  gas: string;
  gasPrice: string;
  /** Encoded calldata for the swap router. */
  data: `0x${string}`;
  to: `0x${string}`;
  /** Route description for display. */
  sources: QuoteSource[];
  priceImpactBps: number;
  expiresAt: number;
}

export interface QuoteSource {
  name: string;
  proportion: string;
}

export interface SwapParams {
  fromToken: TokenInfo;
  toToken: TokenInfo;
  fromAmount: string;
  slippageBps: number;
  /** If true, route via CoW/0x-gasless intent for MEV protection. */
  useIntent: boolean;
}

export interface SwapSession {
  id: string;
  state: SwapState;
  params: SwapParams;
  quote?: SwapQuote;
  txHash?: `0x${string}`;
  errorMessage?: string;
  /** Thread the swap was initiated from — for posting the receipt back. */
  originThreadId?: string;
}
