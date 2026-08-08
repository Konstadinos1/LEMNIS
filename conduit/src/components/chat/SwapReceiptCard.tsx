import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { TransactionPill } from './TransactionPill';
import { colors, radius, spacing, typography } from '@/theme/tokens';
import type { SwapReceipt } from '@/types/message';

interface Props {
  receipt: SwapReceipt;
  onTxPress?: () => void;
}

export function SwapReceiptCard({ receipt, onTxPress }: Props) {
  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.label}>Swap</Text>
        <TransactionPill
          txHash={receipt.txHash}
          status={receipt.status}
          chainId={receipt.chainId}
          onPress={onTxPress}
        />
      </View>

      <View style={styles.row}>
        <View style={styles.tokenCell}>
          <Text style={styles.amount}>{formatAmount(receipt.fromAmount, receipt.fromToken.decimals)}</Text>
          <Text style={styles.symbol}>{receipt.fromToken.symbol}</Text>
        </View>

        <Text style={styles.arrow}>→</Text>

        <View style={[styles.tokenCell, styles.tokenCellRight]}>
          <Text style={styles.amount}>{formatAmount(receipt.toAmount, receipt.toToken.decimals)}</Text>
          <Text style={styles.symbol}>{receipt.toToken.symbol}</Text>
        </View>
      </View>
    </View>
  );
}

function formatAmount(raw: string, decimals: number): string {
  const n = Number(BigInt(raw)) / 10 ** decimals;
  return n < 0.001 ? n.toExponential(2) : n.toLocaleString(undefined, { maximumFractionDigits: 6 });
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.bg.elevated,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border.default,
    gap: spacing.sm,
    maxWidth: 280,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  label: {
    fontSize: typography.size.xs,
    color: colors.text.tertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    fontWeight: typography.weight.semibold as '600',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  tokenCell: {
    flex: 1,
  },
  tokenCellRight: {
    alignItems: 'flex-end',
  },
  amount: {
    fontSize: typography.size.lg,
    fontWeight: typography.weight.bold as '700',
    color: colors.text.primary,
  },
  symbol: {
    fontSize: typography.size.sm,
    color: colors.text.secondary,
  },
  arrow: {
    color: colors.text.tertiary,
    fontSize: typography.size.md,
  },
});
