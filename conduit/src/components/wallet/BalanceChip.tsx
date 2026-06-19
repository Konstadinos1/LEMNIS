import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, radius, spacing, typography } from '@/theme/tokens';

interface Props {
  symbol: string;
  balance: string;
  usdValue?: number;
}

export function BalanceChip({ symbol, balance, usdValue }: Props) {
  return (
    <View style={styles.chip}>
      <Text style={styles.symbol}>{symbol}</Text>
      <Text style={styles.balance}>{balance}</Text>
      {usdValue !== undefined && (
        <Text style={styles.usd}>
          ${usdValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    backgroundColor: colors.bg.elevated,
    borderRadius: radius.lg,
    padding: spacing.md,
    alignItems: 'center',
    gap: 2,
    minWidth: 90,
    borderWidth: 1,
    borderColor: colors.border.default,
  },
  symbol: {
    fontSize: typography.size.xs,
    fontWeight: typography.weight.semibold as '600',
    color: colors.text.tertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  balance: {
    fontSize: typography.size.lg,
    fontWeight: typography.weight.bold as '700',
    color: colors.text.primary,
  },
  usd: {
    fontSize: typography.size.sm,
    color: colors.text.secondary,
  },
});
