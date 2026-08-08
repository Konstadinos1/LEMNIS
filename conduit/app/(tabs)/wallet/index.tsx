import React from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  SafeAreaView,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
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
  const { isLoading, refetch } = useBalances();

  const totalUsd = balances.reduce((sum, b) => sum + b.balanceUsd, 0);
  const shortAddress = account
    ? `${account.address.slice(0, 8)}…${account.address.slice(-6)}`
    : '—';

  async function handleCopyAddress() {
    if (!account) return;
    await Clipboard.setStringAsync(account.address);
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>Wallet</Text>

        {/* Address */}
        <Pressable style={styles.addressRow} onPress={handleCopyAddress}>
          <Text style={styles.address}>{shortAddress}</Text>
          {account && !account.isDeployed && (
            <View style={styles.counterfactualBadge}>
              <Text style={styles.counterfactualText}>Not deployed</Text>
            </View>
          )}
          <Text style={styles.copyHint}>Copy</Text>
        </Pressable>

        {/* Total */}
        <View style={styles.totalCard}>
          <Text style={styles.totalLabel}>Total value</Text>
          <Text style={styles.totalValue}>
            ${totalUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </Text>
          {isLoading && <ActivityIndicator color={colors.brand.primary} size="small" />}
        </View>

        {/* Token list */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Assets</Text>
            <Pressable onPress={() => refetch()}>
              <Text style={styles.refreshText}>Refresh</Text>
            </Pressable>
          </View>
          {balances.length === 0 && !isLoading ? (
            <Text style={styles.empty}>No assets yet. Fund your wallet to get started.</Text>
          ) : (
            <View style={styles.tokenList}>
              {balances.map((b) => (
                <View key={b.token.address} style={styles.tokenRow}>
                  <View style={styles.tokenInfo}>
                    <Text style={styles.tokenSymbol}>{b.token.symbol}</Text>
                    <Text style={styles.tokenName}>{b.token.name}</Text>
                  </View>
                  <View style={styles.tokenBalance}>
                    <Text style={styles.tokenAmount}>
                      {Number(formatUnits(b.balance, b.token.decimals)).toLocaleString(
                        undefined, { maximumFractionDigits: 6 }
                      )}
                    </Text>
                    <Text style={styles.tokenUsd}>
                      ${b.balanceUsd.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* Actions */}
        <View style={styles.actions}>
          <Button label="Swap" variant="primary" size="lg" fullWidth onPress={() => openSwapSheet()} />
          <View style={styles.row2}>
            <Button
              label="Receive"
              variant="secondary"
              size="md"
              fullWidth
              onPress={() => router.push('/(tabs)/wallet/receive')}
            />
            <Button
              label="Send"
              variant="secondary"
              size="md"
              fullWidth
              onPress={() => router.push('/(tabs)/wallet/send')}
            />
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg.base },
  container: { padding: spacing.xl, gap: spacing.lg, paddingBottom: spacing['3xl'] },
  title: {
    fontSize: typography.size['2xl'],
    fontWeight: typography.weight.bold as '700',
    color: colors.text.primary,
  },
  addressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.bg.elevated,
    borderRadius: radius.md,
    padding: spacing.sm,
  },
  address: {
    fontSize: typography.size.sm,
    fontFamily: 'Courier',
    color: colors.text.secondary,
    flex: 1,
  },
  counterfactualBadge: {
    backgroundColor: colors.bg.overlay,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  counterfactualText: { fontSize: typography.size.xs, color: colors.brand.accent },
  copyHint: { fontSize: typography.size.xs, color: colors.brand.primary },
  totalCard: {
    backgroundColor: colors.bg.elevated,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border.default,
  },
  totalLabel: {
    fontSize: typography.size.sm,
    color: colors.text.tertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  totalValue: {
    fontSize: typography.size['3xl'],
    fontWeight: typography.weight.bold as '700',
    color: colors.text.primary,
  },
  section: { gap: spacing.sm },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionTitle: {
    fontSize: typography.size.base,
    fontWeight: typography.weight.semibold as '600',
    color: colors.text.primary,
  },
  refreshText: { fontSize: typography.size.sm, color: colors.brand.primary },
  tokenList: {
    backgroundColor: colors.bg.elevated,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border.default,
    overflow: 'hidden',
  },
  tokenRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.default,
  },
  tokenInfo: { gap: 2 },
  tokenSymbol: {
    fontSize: typography.size.base,
    fontWeight: typography.weight.semibold as '600',
    color: colors.text.primary,
  },
  tokenName: { fontSize: typography.size.sm, color: colors.text.secondary },
  tokenBalance: { alignItems: 'flex-end', gap: 2 },
  tokenAmount: {
    fontSize: typography.size.base,
    fontWeight: typography.weight.medium as '500',
    color: colors.text.primary,
  },
  tokenUsd: { fontSize: typography.size.sm, color: colors.text.secondary },
  empty: { fontSize: typography.size.sm, color: colors.text.tertiary, lineHeight: 22 },
  actions: { gap: spacing.sm },
  row2: { flexDirection: 'row', gap: spacing.sm },
});
