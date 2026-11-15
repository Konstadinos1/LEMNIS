import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  Pressable,
  Alert,
} from 'react-native';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { parseUnits } from 'viem';
import { useWalletStore } from '@/store/wallet';
import { Button } from '@/components/ui/Button';
import { colors, spacing, typography, radius } from '@/theme/tokens';
import type { SessionKey } from '@/types/wallet';

// 0x universal router on Base
const UNIVERSAL_ROUTER = '0x3fC91A3afd70395Cd496C647d5a6CC9D4B2b7FAD' as const;

export default function SessionKeysScreen() {
  const sessionKeys = useWalletStore((s) => s.sessionKeys);
  const addSessionKey = useWalletStore((s) => s.addSessionKey);
  const removeSessionKey = useWalletStore((s) => s.removeSessionKey);

  const [maxPerTx, setMaxPerTx] = useState('100');
  const [maxPerDay, setMaxPerDay] = useState('500');
  const [expiryHours, setExpiryHours] = useState('24');
  const [creating, setCreating] = useState(false);

  async function handleCreate() {
    setCreating(true);
    try {
      // In production: issue a session key via the Kernel v3 SessionKeyModule,
      // scoped to the swap router with the specified limits, via a UserOperation
      // signed by the passkey.
      await new Promise((r) => setTimeout(r, 1000));

      const sk: SessionKey = {
        address: `0x${crypto.randomUUID().replace(/-/g, '').slice(0, 40)}` as `0x${string}`,
        expiresAt: Date.now() + Number(expiryHours) * 3600 * 1000,
        maxSpendPerTx: parseUnits(maxPerTx, 6),
        maxSpendPerDay: parseUnits(maxPerDay, 6),
        allowedTargets: [UNIVERSAL_ROUTER],
      };
      addSessionKey(sk);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {
      Alert.alert('Error', (e as Error).message);
    } finally {
      setCreating(false);
    }
  }

  function handleRevoke(address: string) {
    Alert.alert('Revoke session key', 'This will submit an on-chain transaction.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Revoke', style: 'destructive', onPress: () => removeSessionKey(address) },
    ]);
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()}>
          <Text style={styles.back}>‹ Back</Text>
        </Pressable>
        <Text style={styles.title}>Session keys</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.description}>
          Session keys pre-authorise routine swaps up to a cap so you don't need
          biometrics for every small transaction. They are scoped to the swap router
          only and expire automatically.
        </Text>

        {/* Active keys */}
        {sessionKeys.filter((k) => k.expiresAt > Date.now()).length > 0 ? (
          <View style={styles.list}>
            {sessionKeys
              .filter((k) => k.expiresAt > Date.now())
              .map((k) => (
                <SessionKeyCard key={k.address} sk={k} onRevoke={handleRevoke} />
              ))}
          </View>
        ) : (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>No active session keys.</Text>
          </View>
        )}

        {/* Create */}
        <View style={styles.createCard}>
          <Text style={styles.createTitle}>Create session key</Text>
          <View style={styles.fieldRow}>
            <Text style={styles.fieldLabel}>Max per-tx (USDC)</Text>
            <TextInput
              style={styles.fieldInput}
              value={maxPerTx}
              onChangeText={setMaxPerTx}
              keyboardType="decimal-pad"
            />
          </View>
          <View style={styles.fieldRow}>
            <Text style={styles.fieldLabel}>Max per-day (USDC)</Text>
            <TextInput
              style={styles.fieldInput}
              value={maxPerDay}
              onChangeText={setMaxPerDay}
              keyboardType="decimal-pad"
            />
          </View>
          <View style={styles.fieldRow}>
            <Text style={styles.fieldLabel}>Expires in (hours)</Text>
            <TextInput
              style={styles.fieldInput}
              value={expiryHours}
              onChangeText={setExpiryHours}
              keyboardType="number-pad"
            />
          </View>
          <Button
            label="Create (requires Face ID)"
            variant="primary"
            size="md"
            fullWidth
            loading={creating}
            disabled={creating}
            onPress={handleCreate}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function SessionKeyCard({ sk, onRevoke }: { sk: SessionKey; onRevoke: (a: string) => void }) {
  const expiry = new Date(sk.expiresAt).toLocaleString();
  const maxTx = (Number(sk.maxSpendPerTx) / 1e6).toFixed(0);
  const maxDay = (Number(sk.maxSpendPerDay) / 1e6).toFixed(0);

  return (
    <View style={styles.skCard}>
      <View style={styles.skInfo}>
        <Text style={styles.skAddr}>
          {sk.address.slice(0, 8)}…{sk.address.slice(-6)}
        </Text>
        <Text style={styles.skMeta}>Up to ${maxTx}/tx · ${maxDay}/day</Text>
        <Text style={styles.skMeta}>Expires {expiry}</Text>
      </View>
      <Pressable style={styles.revokeBtn} onPress={() => onRevoke(sk.address)}>
        <Text style={styles.revokeBtnText}>Revoke</Text>
      </Pressable>
    </View>
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
  container: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing['3xl'] },
  description: { fontSize: typography.size.sm, color: colors.text.secondary, lineHeight: 22 },
  list: { gap: spacing.sm },
  emptyCard: {
    backgroundColor: colors.bg.elevated,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border.default,
  },
  emptyText: { fontSize: typography.size.sm, color: colors.text.tertiary },
  createCard: {
    backgroundColor: colors.bg.elevated,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.border.default,
  },
  createTitle: {
    fontSize: typography.size.base,
    fontWeight: typography.weight.semibold as '600',
    color: colors.text.primary,
  },
  fieldRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  fieldLabel: { fontSize: typography.size.sm, color: colors.text.secondary, flex: 1 },
  fieldInput: {
    backgroundColor: colors.bg.overlay,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    color: colors.text.primary,
    fontSize: typography.size.base,
    textAlign: 'right',
    minWidth: 80,
    borderWidth: 1,
    borderColor: colors.border.default,
  },
  skCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bg.elevated,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.border.default,
  },
  skInfo: { flex: 1, gap: 2 },
  skAddr: { fontFamily: 'Courier', fontSize: typography.size.xs, color: colors.text.primary },
  skMeta: { fontSize: typography.size.xs, color: colors.text.secondary },
  revokeBtn: {
    borderWidth: 1,
    borderColor: colors.error,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  revokeBtnText: { color: colors.error, fontSize: typography.size.xs },
});
