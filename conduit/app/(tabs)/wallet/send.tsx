import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  SafeAreaView,
  Pressable,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useWalletStore } from '@/store/wallet';
import { signUserOp, buildUnsignedUserOp } from '@/lib/wallet/smartAccount';
import { Button } from '@/components/ui/Button';
import { colors, spacing, typography, radius } from '@/theme/tokens';
import { encodeFunctionData, parseUnits, type Address } from 'viem';

type State = 'idle' | 'sending' | 'done' | 'error';

// ERC-20 transfer ABI fragment
const ERC20_TRANSFER_ABI = [
  {
    name: 'transfer',
    type: 'function',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
] as const;

const API = process.env.EXPO_PUBLIC_API_BASE_URL ?? 'https://api.conduit.app';

export default function SendScreen() {
  const account = useWalletStore((s) => s.account);
  const balances = useWalletStore((s) => s.balances);

  const [toAddress, setToAddress] = useState('');
  const [amount, setAmount] = useState('');
  const [selectedToken, setSelectedToken] = useState(balances[0]?.token ?? null);
  const [state, setState] = useState<State>('idle');
  const [txHash, setTxHash] = useState('');

  async function handleSend() {
    if (!account || !selectedToken || !toAddress || !amount) return;

    if (!/^0x[0-9a-fA-F]{40}$/.test(toAddress)) {
      Alert.alert('Invalid address');
      return;
    }

    setState('sending');
    try {
      const callData = encodeFunctionData({
        abi: ERC20_TRANSFER_ABI,
        functionName: 'transfer',
        args: [toAddress as Address, parseUnits(amount, selectedToken.decimals)],
      });

      const nonce = BigInt(Date.now());
      const unsignedOp = buildUnsignedUserOp({
        sender: account.address,
        callData: callData as `0x${string}`,
        nonce,
      });

      // Sponsor + get userOpHash
      const sponsorRes = await fetch(`${API}/api/wallet/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userOp: unsignedOp,
          tokenAddress: selectedToken.address,
          to: toAddress,
          amount: parseUnits(amount, selectedToken.decimals).toString(),
          accountAddress: account.address,
        }),
      });

      if (!sponsorRes.ok) throw new Error(await sponsorRes.text());
      const { userOpHash, sponsoredOp } = await sponsorRes.json() as {
        userOpHash: `0x${string}`;
        sponsoredOp: Record<string, unknown>;
      };

      if (!account.passkeyCredentialId) throw new Error('No passkey');
      const signature = await signUserOp(account.passkeyCredentialId, userOpHash);

      const submitRes = await fetch(`${API}/api/wallet/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userOp: { ...sponsoredOp, signature } }),
      });
      if (!submitRes.ok) throw new Error(await submitRes.text());
      const { txHash: hash } = await submitRes.json() as { txHash: string };

      setTxHash(hash);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setState('done');
    } catch (e) {
      Alert.alert('Send failed', (e as Error).message);
      setState('error');
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()}>
          <Text style={styles.back}>‹ Back</Text>
        </Pressable>
        <Text style={styles.title}>Send</Text>
        <View style={{ width: 60 }} />
      </View>

      {state === 'done' ? (
        <View style={styles.successContainer}>
          <Text style={styles.successIcon}>✓</Text>
          <Text style={styles.successTitle}>Sent!</Text>
          <Text style={styles.successHash}>
            {txHash.slice(0, 10)}…{txHash.slice(-8)}
          </Text>
          <Button label="Done" variant="primary" size="lg" onPress={() => router.back()} />
        </View>
      ) : (
        <View style={styles.form}>
          {/* Token selector */}
          <View>
            <Text style={styles.label}>Asset</Text>
            <View style={styles.tokenPicker}>
              {balances.map((b) => (
                <Pressable
                  key={b.token.address}
                  style={[
                    styles.tokenChip,
                    selectedToken?.address === b.token.address && styles.tokenChipActive,
                  ]}
                  onPress={() => setSelectedToken(b.token)}
                >
                  <Text
                    style={[
                      styles.tokenChipText,
                      selectedToken?.address === b.token.address && styles.tokenChipTextActive,
                    ]}
                  >
                    {b.token.symbol}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          {/* To */}
          <View>
            <Text style={styles.label}>To address</Text>
            <TextInput
              style={styles.input}
              placeholder="0x…"
              placeholderTextColor={colors.text.tertiary}
              value={toAddress}
              onChangeText={setToAddress}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          {/* Amount */}
          <View>
            <Text style={styles.label}>Amount ({selectedToken?.symbol ?? '—'})</Text>
            <TextInput
              style={styles.input}
              placeholder="0.00"
              placeholderTextColor={colors.text.tertiary}
              value={amount}
              onChangeText={setAmount}
              keyboardType="decimal-pad"
            />
          </View>

          <Button
            label={state === 'sending' ? 'Sending…' : 'Review & send'}
            variant="primary"
            size="lg"
            fullWidth
            loading={state === 'sending'}
            disabled={!toAddress || !amount || state === 'sending'}
            onPress={handleSend}
          />
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg.base },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.lg,
  },
  back: { color: colors.brand.primary, fontSize: typography.size.base },
  title: {
    fontSize: typography.size.md,
    fontWeight: typography.weight.semibold as '600',
    color: colors.text.primary,
  },
  form: { padding: spacing.lg, gap: spacing.lg },
  label: { fontSize: typography.size.sm, color: colors.text.secondary, marginBottom: spacing.xs },
  input: {
    backgroundColor: colors.bg.elevated,
    borderRadius: radius.md,
    padding: spacing.md,
    color: colors.text.primary,
    fontSize: typography.size.base,
    borderWidth: 1,
    borderColor: colors.border.default,
  },
  tokenPicker: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  tokenChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
    backgroundColor: colors.bg.elevated,
    borderWidth: 1,
    borderColor: colors.border.default,
  },
  tokenChipActive: { backgroundColor: colors.brand.primary, borderColor: colors.brand.primary },
  tokenChipText: { fontSize: typography.size.sm, color: colors.text.secondary },
  tokenChipTextActive: { color: colors.text.inverse, fontWeight: typography.weight.semibold as '600' },
  successContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    padding: spacing.xl,
  },
  successIcon: { fontSize: 64, color: colors.success },
  successTitle: {
    fontSize: typography.size['2xl'],
    fontWeight: typography.weight.bold as '700',
    color: colors.text.primary,
  },
  successHash: {
    fontFamily: 'Courier',
    fontSize: typography.size.sm,
    color: colors.text.secondary,
  },
});
