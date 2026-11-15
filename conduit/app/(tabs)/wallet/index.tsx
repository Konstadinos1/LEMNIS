import React from 'react';
import { View, Text, ScrollView, StyleSheet, SafeAreaView } from 'react-native';
import { useWalletStore } from '@/store/wallet';
import { useBalances } from '@/hooks/useWallet';
import { BalanceChip } from '@/components/wallet/BalanceChip';
import { Button } from '@/components/ui/Button';
import { useSwapStore } from '@/store/swap';
import { colors, spacing, typography, radius } from '@/theme/tokens';
import { formatUnits } from 'viem';

export default function WalletScreen() {
  const account = useWalletStore((s) => s.account);
  const balances = useWalletStore((s) => s.balances);
  const openSwapSheet = useSwapStore((s) => s.openSwapSheet);
  const { isLoading } = useBalances();

  const shortAddress = account
    ? `${account.address.slice(0, 6)}…${account.address.slice(-4)}`
    : '—';

  const totalUsd = balances.reduce((sum, b) => sum + b.balanceUsd, 0);

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>Wallet</Text>

        {/* Address chip */}
        <View style={styles.addressRow}>
          <Text style={styles.address}>{shortAddress}</Text>
          {account && !account.isDeployed && (
            <Text style={styles.counterfactual}>Counterfactual (ERC-6492)</Text>
          )}
        </View>

        {/* Total balance */}
        <Text style={styles.totalLabel}>Total value</Text>
        <Text style={styles.totalValue}>
          ${totalUsd.toLocaleString(undefined, { minimumFractionDigits: 2 })}
        </Text>

        {/* Token chips */}
        <View style={styles.chips}>
          {isLoading ? (
            <Text style={styles.loading}>Loading balances…</Text>
          ) : balances.length === 0 ? (
            <Text style={styles.empty}>No assets yet. Add funds to get started.</Text>
          ) : (
            balances.map((b) => (
              <BalanceChip
                key={b.token.address}
                symbol={b.token.symbol}
                balance={formatUnits(b.balance, b.token.decimals)}
                usdValue={b.balanceUsd}
              />
            ))
          )}
        </View>

        {/* Actions */}
        <View style={styles.actions}>
          <Button
            label="Swap"
            variant="primary"
            size="lg"
            fullWidth
            onPress={() => openSwapSheet()}
          />
          <Button
            label="Receive"
            variant="secondary"
            size="lg"
            fullWidth
            onPress={() => {}}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg.base },
  container: { padding: spacing.xl, gap: spacing.md },
  title: {
    fontSize: typography.size['2xl'],
    fontWeight: typography.weight.bold as '700',
    color: colors.text.primary,
  },
  addressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  address: {
    fontSize: typography.size.sm,
    fontFamily: 'Courier',
    color: colors.text.secondary,
    backgroundColor: colors.bg.elevated,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.sm,
  },
  counterfactual: {
    fontSize: typography.size.xs,
    color: colors.brand.accent,
  },
  totalLabel: {
    fontSize: typography.size.sm,
    color: colors.text.tertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginTop: spacing.lg,
  },
  totalValue: {
    fontSize: typography.size['3xl'],
    fontWeight: typography.weight.bold as '700',
    color: colors.text.primary,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  loading: { color: colors.text.tertiary, fontSize: typography.size.sm },
  empty: {
    color: colors.text.tertiary,
    fontSize: typography.size.sm,
    lineHeight: 22,
  },
  actions: {
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
});
