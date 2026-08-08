import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, spacing, typography, radius } from '@/theme/tokens';
import type { SwapQuote } from '@/types/swap';

interface Props {
  quote: SwapQuote;
  slippageBps: number;
}

export function QuoteDisplay({ quote, slippageBps }: Props) {
  const priceImpact = (quote.priceImpactBps / 100).toFixed(2);
  const slippage = (slippageBps / 100).toFixed(2);
  const routeLabel = quote.sources.map((s) => s.name).join(' + ');

  return (
    <View style={styles.container}>
      <Row label="Price impact" value={`${priceImpact}%`} warning={quote.priceImpactBps > 100} />
      <Row label="Max slippage" value={`${slippage}%`} />
      <Row label="Route" value={routeLabel} />
      <Row label="Gas (sponsored)" value="$0.00" />
    </View>
  );
}

function Row({ label, value, warning }: { label: string; value: string; warning?: boolean }) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text style={[styles.value, warning && styles.warningValue]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.bg.overlay,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.xs,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  label: {
    fontSize: typography.size.sm,
    color: colors.text.secondary,
  },
  value: {
    fontSize: typography.size.sm,
    fontWeight: typography.weight.medium as '500',
    color: colors.text.primary,
  },
  warningValue: { color: colors.warning },
});
