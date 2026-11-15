import { useQuery } from '@tanstack/react-query';
import { useWalletStore } from '@/store/wallet';
import { loadSmartAccount } from '@/crypto/wallet';
import type { TokenBalance } from '@/types/wallet';

async function fetchBalances(address: string): Promise<TokenBalance[]> {
  const res = await fetch(
    `${process.env.EXPO_PUBLIC_API_BASE_URL}/api/wallet/balances?address=${address}&chainId=8453`
  );
  if (!res.ok) throw new Error('Balance fetch failed');
  return res.json() as Promise<TokenBalance[]>;
}

export function useWalletInit() {
  const setAccount = useWalletStore((s) => s.setAccount);

  return useQuery({
    queryKey: ['wallet-init'],
    queryFn: async () => {
      const account = await loadSmartAccount();
      if (account) setAccount(account);
      return account;
    },
    staleTime: Infinity,
    retry: 1,
  });
}

export function useBalances() {
  const account = useWalletStore((s) => s.account);
  const setBalances = useWalletStore((s) => s.setBalances);

  return useQuery({
    queryKey: ['balances', account?.address],
    queryFn: async () => {
      const balances = await fetchBalances(account!.address);
      setBalances(balances);
      return balances;
    },
    enabled: !!account?.address,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}
