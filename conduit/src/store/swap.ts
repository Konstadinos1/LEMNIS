import { create } from 'zustand';
import type { SwapSession, SwapState } from '@/types/swap';

interface SwapStore {
  session: SwapSession | null;
  isSheetOpen: boolean;

  openSwapSheet: (originThreadId?: string) => void;
  closeSwapSheet: () => void;
  setSwapState: (state: SwapState) => void;
  patchSession: (patch: Partial<SwapSession>) => void;
  resetSession: () => void;
}

export const useSwapStore = create<SwapStore>((set) => ({
  session: null,
  isSheetOpen: false,

  openSwapSheet: (originThreadId) =>
    set({
      isSheetOpen: true,
      session: {
        id: crypto.randomUUID(),
        state: 'idle',
        params: {
          fromToken: null as never,
          toToken: null as never,
          fromAmount: '',
          slippageBps: 50,
          useIntent: false,
        },
        originThreadId,
      },
    }),

  closeSwapSheet: () => set({ isSheetOpen: false }),

  setSwapState: (state) =>
    set((s) => ({
      session: s.session ? { ...s.session, state } : null,
    })),

  patchSession: (patch) =>
    set((s) => ({
      session: s.session ? { ...s.session, ...patch } : null,
    })),

  resetSession: () => set({ session: null, isSheetOpen: false }),
}));
