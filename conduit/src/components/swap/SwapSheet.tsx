import React, { useCallback, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Pressable,
} from 'react-native';
import BottomSheet, { BottomSheetView, BottomSheetScrollView } from '@gorhom/bottom-sheet';
import * as Haptics from 'expo-haptics';
import { useSwapStore } from '@/store/swap';
import { useChatStore } from '@/store/chat';
import { useWalletStore } from '@/store/wallet';
import { useSwapQuote } from '@/hooks/useSwapQuote';
import { executeSwap } from '@/lib/swap/execute';
import { Button } from '@/components/ui/Button';
import { AssetPicker } from './AssetPicker';
import { QuoteDisplay } from './QuoteDisplay';
import { colors, radius, spacing, typography, spring } from '@/theme/tokens';
import type { SwapReceiptMessage } from '@/types/message';
import type { TokenInfo } from '@/types/wallet';

const SNAP_POINTS = ['60%', '92%'];

export function SwapSheet() {
  const { session, isSheetOpen, closeSwapSheet, patchSession, setSwapState, resetSession } =
    useSwapStore();
  const account = useWalletStore((s) => s.account);
  const appendMessage = useChatStore((s) => s.appendMessage);
  const sheetRef = useRef<BottomSheet>(null);
  const [error, setError] = useState('');

  const { data: quote, isLoading: quoteFetching } = useSwapQuote(
    session?.state !== 'idle' &&
    session?.params.fromToken &&
    session?.params.toToken &&
    session?.params.fromAmount
      ? session.params
      : null
  );

  const handleSheetChange = useCallback(
    (index: number) => { if (index === -1) closeSwapSheet(); },
    [closeSwapSheet]
  );

  function setFromToken(token: TokenInfo) {
    patchSession({ params: { ...session!.params, fromToken: token } });
    setSwapState('fetching_quote');
  }

  function setToToken(token: TokenInfo) {
    patchSession({ params: { ...session!.params, toToken: token } });
    setSwapState('fetching_quote');
  }

  function setAmount(v: string) {
    patchSession({ params: { ...session!.params, fromAmount: v } });
    if (v && session?.params.fromToken && session?.params.toToken) setSwapState('fetching_quote');
  }

  async function handleConfirmSwap() {
    if (!session || !quote || !account) return;
    setError('');
    setSwapState('awaiting_signature');

    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      setSwapState('broadcasting');

      const { txHash } = await executeSwap(account, quote, session.params);

      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setSwapState('settled');
      patchSession({ txHash, state: 'settled' });

      // Post the swap receipt back to the originating thread as an encrypted message
      if (session.originThreadId) {
        const receiptMsg: SwapReceiptMessage = {
          id: crypto.randomUUID(),
          threadId: session.originThreadId,
          senderId: account.address,
          timestamp: Date.now(),
          type: 'swap_receipt',
          ciphertext: '',
          receipt: {
            txHash,
            fromToken: session.params.fromToken,
            toToken: session.params.toToken,
            fromAmount: quote.sellAmount,
            toAmount: quote.buyAmount,
            chainId: account.chainId,
            timestamp: Date.now(),
            status: 'pending',
          },
        };
        appendMessage(session.originThreadId, receiptMsg);
      }

      setTimeout(resetSession, 2000);
    } catch (e) {
      const msg = (e as Error).message;
      setError(msg);
      setSwapState('error');
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  }

  if (!isSheetOpen) return null;

  const busy = session?.state === 'broadcasting' || session?.state === 'awaiting_signature';
  const canConfirm = !!quote && !quoteFetching && !busy &&
    !!session?.params.fromToken && !!session?.params.toToken && !!session?.params.fromAmount;

  const buyDisplay = quote
    ? (Number(BigInt(quote.buyAmount)) / 10 ** (session?.params.toToken?.decimals ?? 18))
        .toLocaleString(undefined, { maximumFractionDigits: 6 })
    : '—';

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
      <BottomSheetScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Swap</Text>

        {/* From */}
        <View style={styles.card}>
          <View style={styles.cardRow}>
            <AssetPicker
              label="From"
              selected={session?.params.fromToken}
              excluded={session?.params.toToken}
              onSelect={setFromToken}
            />
          </View>
          <TextInput
            style={styles.amountInput}
            placeholder="0.00"
            placeholderTextColor={colors.text.tertiary}
            keyboardType="decimal-pad"
            value={session?.params.fromAmount}
            onChangeText={setAmount}
          />
        </View>

        {/* Direction arrow */}
        <Pressable
          style={styles.arrowBtn}
          onPress={() => {
            if (!session) return;
            patchSession({
              params: {
                ...session.params,
                fromToken: session.params.toToken,
                toToken: session.params.fromToken,
                fromAmount: '',
              },
            });
          }}
        >
          <Text style={styles.arrowText}>⇅</Text>
        </Pressable>

        {/* To */}
        <View style={styles.card}>
          <View style={styles.cardRow}>
            <AssetPicker
              label="To"
              selected={session?.params.toToken}
              excluded={session?.params.fromToken}
              onSelect={setToToken}
            />
          </View>
          <Text style={[styles.amountInput, styles.amountOut]}>{buyDisplay}</Text>
        </View>

        {/* Slippage */}
        <View style={styles.slippageRow}>
          <Text style={styles.slippageLabel}>Slippage</Text>
          {[10, 50, 100].map((bps) => (
            <Pressable
              key={bps}
              style={[
                styles.slippageChip,
                session?.params.slippageBps === bps && styles.slippageChipActive,
              ]}
              onPress={() => patchSession({ params: { ...session!.params, slippageBps: bps } })}
            >
              <Text
                style={[
                  styles.slippageChipText,
                  session?.params.slippageBps === bps && styles.slippageChipTextActive,
                ]}
              >
                {bps / 100}%
              </Text>
            </Pressable>
          ))}
        </View>

        {/* Quote details */}
        {quote && (
          <QuoteDisplay quote={quote} slippageBps={session?.params.slippageBps ?? 50} />
        )}
        {quoteFetching && (
          <Text style={styles.fetching}>Fetching best price…</Text>
        )}

        {/* Error */}
        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        {/* Confirm */}
        <Button
          label={
            busy ? 'Signing & broadcasting…'
              : session?.state === 'settled' ? '✓ Swap complete'
              : 'Confirm swap'
          }
          variant={session?.state === 'settled' ? 'secondary' : 'primary'}
          size="lg"
          fullWidth
          loading={busy}
          disabled={!canConfirm}
          onPress={handleConfirmSwap}
        />

        <Text style={styles.disclaimer}>
          Gas is sponsored · On-chain transactions are public and permanent
        </Text>
      </BottomSheetScrollView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  background: { backgroundColor: colors.bg.elevated },
  handle: { backgroundColor: colors.border.strong, width: 40 },
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing['3xl'] },
  title: {
    fontSize: typography.size['2xl'],
    fontWeight: typography.weight.bold as '700',
    color: colors.text.primary,
    marginBottom: spacing.xs,
  },
  card: {
    backgroundColor: colors.bg.overlay,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.sm,
  },
  cardRow: { flexDirection: 'row' },
  amountInput: {
    fontSize: typography.size.xl,
    fontWeight: typography.weight.bold as '700',
    color: colors.text.primary,
    paddingVertical: spacing.xs,
  },
  amountOut: { color: colors.text.secondary },
  arrowBtn: {
    alignSelf: 'center',
    width: 36,
    height: 36,
    borderRadius: radius.full,
    backgroundColor: colors.bg.overlay,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: -spacing.xs,
    zIndex: 1,
  },
  arrowText: { fontSize: typography.size.lg, color: colors.brand.primary },
  slippageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  slippageLabel: {
    fontSize: typography.size.sm,
    color: colors.text.secondary,
    flex: 1,
  },
  slippageChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
    backgroundColor: colors.bg.overlay,
    borderWidth: 1,
    borderColor: colors.border.default,
  },
  slippageChipActive: {
    backgroundColor: colors.brand.primary,
    borderColor: colors.brand.primary,
  },
  slippageChipText: { fontSize: typography.size.sm, color: colors.text.secondary },
  slippageChipTextActive: { color: colors.text.inverse, fontWeight: typography.weight.semibold as '600' },
  fetching: { fontSize: typography.size.sm, color: colors.text.tertiary, textAlign: 'center' },
  errorText: { color: colors.error, fontSize: typography.size.sm, textAlign: 'center' },
  disclaimer: {
    fontSize: typography.size.xs,
    color: colors.text.tertiary,
    textAlign: 'center',
    lineHeight: 18,
  },
});
