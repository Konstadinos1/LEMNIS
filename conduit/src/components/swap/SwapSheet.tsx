import React, { useCallback, useRef } from 'react';
import { View, Text, TextInput, StyleSheet } from 'react-native';
import BottomSheet, { BottomSheetView } from '@gorhom/bottom-sheet';
import * as Haptics from 'expo-haptics';
import { useSwapStore } from '@/store/swap';
import { useSwapQuote } from '@/hooks/useSwapQuote';
import { requireBiometric } from '@/crypto/wallet';
import { Button } from '@/components/ui/Button';
import { QuoteDisplay } from './QuoteDisplay';
import { colors, radius, spacing, typography, spring } from '@/theme/tokens';

const SNAP_POINTS = ['60%', '92%'];

export function SwapSheet() {
  const { session, isSheetOpen, closeSwapSheet, patchSession, setSwapState } = useSwapStore();
  const sheetRef = useRef<BottomSheet>(null);

  const { data: quote, isLoading: quoteFetching } = useSwapQuote(
    session?.state !== 'idle' ? session?.params ?? null : null
  );

  const handleSheetChange = useCallback(
    (index: number) => {
      if (index === -1) closeSwapSheet();
    },
    [closeSwapSheet]
  );

  async function handleConfirmSwap() {
    if (!session || !quote) return;

    const authed = await requireBiometric();
    if (!authed) return;

    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setSwapState('broadcasting');

    try {
      const res = await fetch(`${process.env.EXPO_PUBLIC_API_BASE_URL}/api/swap/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: session.id, quote }),
      });
      const data = (await res.json()) as { txHash: `0x${string}` };
      patchSession({ txHash: data.txHash, state: 'pending_settlement' });
    } catch (err) {
      setSwapState('error');
      patchSession({ errorMessage: (err as Error).message });
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  }

  if (!isSheetOpen) return null;

  return (
    <BottomSheet
      ref={sheetRef}
      index={0}
      snapPoints={SNAP_POINTS}
      onChange={handleSheetChange}
      enablePanDownToClose
      backgroundStyle={styles.background}
      handleIndicatorStyle={styles.handle}
      animateOnMount
    >
      <BottomSheetView style={styles.content}>
        <Text style={styles.title}>Swap</Text>

        {/* From token row */}
        <View style={styles.tokenRow}>
          <Text style={styles.rowLabel}>From</Text>
          <TextInput
            style={styles.amountInput}
            placeholder="0"
            placeholderTextColor={colors.text.tertiary}
            keyboardType="decimal-pad"
            value={session?.params.fromAmount}
            onChangeText={(v) =>
              patchSession({ params: { ...session!.params, fromAmount: v } })
            }
          />
          <Text style={styles.tokenSymbol}>
            {session?.params.fromToken?.symbol ?? 'Select'}
          </Text>
        </View>

        {/* To token row */}
        <View style={styles.tokenRow}>
          <Text style={styles.rowLabel}>To</Text>
          <Text style={[styles.amountInput, styles.amountOutput]}>
            {quote?.buyAmount
              ? formatAmount(quote.buyAmount, session?.params.toToken?.decimals ?? 18)
              : '—'}
          </Text>
          <Text style={styles.tokenSymbol}>
            {session?.params.toToken?.symbol ?? 'Select'}
          </Text>
        </View>

        {/* Quote details */}
        {quote && (
          <QuoteDisplay
            quote={quote}
            slippageBps={session?.params.slippageBps ?? 50}
          />
        )}

        <Button
          label={
            session?.state === 'broadcasting'
              ? 'Broadcasting…'
              : quoteFetching
              ? 'Fetching quote…'
              : 'Confirm swap'
          }
          variant="primary"
          size="lg"
          fullWidth
          loading={session?.state === 'broadcasting'}
          disabled={!quote || quoteFetching}
          onPress={handleConfirmSwap}
        />

        {session?.state === 'error' && (
          <Text style={styles.errorText}>{session.errorMessage}</Text>
        )}
      </BottomSheetView>
    </BottomSheet>
  );
}

function formatAmount(raw: string, decimals: number): string {
  const n = Number(BigInt(raw)) / 10 ** decimals;
  return n.toLocaleString(undefined, { maximumFractionDigits: 6 });
}

const styles = StyleSheet.create({
  background: { backgroundColor: colors.bg.elevated },
  handle: { backgroundColor: colors.border.strong, width: 40 },
  content: {
    flex: 1,
    padding: spacing.lg,
    gap: spacing.md,
  },
  title: {
    fontSize: typography.size['2xl'],
    fontWeight: typography.weight.bold as '700',
    color: colors.text.primary,
    marginBottom: spacing.sm,
  },
  tokenRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bg.overlay,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm,
  },
  rowLabel: {
    width: 44,
    fontSize: typography.size.sm,
    color: colors.text.tertiary,
    fontWeight: typography.weight.medium as '500',
  },
  amountInput: {
    flex: 1,
    fontSize: typography.size.xl,
    fontWeight: typography.weight.bold as '700',
    color: colors.text.primary,
  },
  amountOutput: {
    color: colors.text.secondary,
  },
  tokenSymbol: {
    fontSize: typography.size.base,
    fontWeight: typography.weight.semibold as '600',
    color: colors.text.primary,
  },
  errorText: {
    color: colors.error,
    fontSize: typography.size.sm,
    textAlign: 'center',
  },
});
