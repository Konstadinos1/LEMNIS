import { create } from 'zustand';
import type { SmartAccount, TokenBalance, Guardian, SessionKey } from '@/types/wallet';

interface WalletState {
  account: SmartAccount | null;
  balances: TokenBalance[];
  guardians: Guardian[];
  sessionKeys: SessionKey[];
  isUnlocked: boolean;

  setAccount: (account: SmartAccount) => void;
  setBalances: (balances: TokenBalance[]) => void;
  setUnlocked: (unlocked: boolean) => void;
  addGuardian: (guardian: Guardian) => void;
  removeGuardian: (address: string) => void;
  addSessionKey: (key: SessionKey) => void;
  removeSessionKey: (address: string) => void;
  reset: () => void;
}

export const useWalletStore = create<WalletState>((set) => ({
  account: null,
  balances: [],
  guardians: [],
  sessionKeys: [],
  isUnlocked: false,

  setAccount: (account) => set({ account }),
  setBalances: (balances) => set({ balances }),
  setUnlocked: (isUnlocked) => set({ isUnlocked }),
  addGuardian: (guardian) =>
    set((s) => ({ guardians: [...s.guardians, guardian] })),
  removeGuardian: (address) =>
    set((s) => ({ guardians: s.guardians.filter((g) => g.address !== address) })),
  addSessionKey: (key) =>
    set((s) => ({ sessionKeys: [...s.sessionKeys, key] })),
  removeSessionKey: (address) =>
    set((s) => ({ sessionKeys: s.sessionKeys.filter((k) => k.address !== address) })),
  reset: () =>
    set({ account: null, balances: [], guardians: [], sessionKeys: [], isUnlocked: false }),
}));
