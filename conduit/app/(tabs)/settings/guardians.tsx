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
import { useWalletStore } from '@/store/wallet';
import { GuardianCard } from '@/components/wallet/GuardianCard';
import { Button } from '@/components/ui/Button';
import { colors, spacing, typography, radius } from '@/theme/tokens';
import type { Guardian } from '@/types/wallet';

export default function GuardiansScreen() {
  const guardians = useWalletStore((s) => s.guardians);
  const addGuardian = useWalletStore((s) => s.addGuardian);
  const removeGuardian = useWalletStore((s) => s.removeGuardian);

  const [newAddress, setNewAddress] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [adding, setAdding] = useState(false);

  async function handleAdd() {
    const addr = newAddress.trim();
    const label = newLabel.trim() || `Guardian ${guardians.length + 1}`;

    if (!/^0x[0-9a-fA-F]{40}$/.test(addr)) {
      Alert.alert('Invalid address');
      return;
    }
    if (guardians.some((g) => g.address === addr)) {
      Alert.alert('Already a guardian');
      return;
    }

    setAdding(true);
    try {
      // In production: call the Kernel v3 GuardianModule to add the guardian on-chain.
      // This requires a UserOperation signed by the current passkey.
      await new Promise((r) => setTimeout(r, 800)); // simulated tx delay

      const guardian: Guardian = {
        address: addr as `0x${string}`,
        label,
        addedAt: Date.now(),
      };
      addGuardian(guardian);
      setNewAddress('');
      setNewLabel('');
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {
      Alert.alert('Error', (e as Error).message);
    } finally {
      setAdding(false);
    }
  }

  function handleRemove(address: string) {
    Alert.alert('Remove guardian', 'Are you sure? This will submit an on-chain transaction.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => removeGuardian(address),
      },
    ]);
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()}>
          <Text style={styles.back}>‹ Back</Text>
        </Pressable>
        <Text style={styles.title}>Guardians</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.description}>
          Guardians can collectively recover your wallet if you lose access.
          You choose an M-of-N threshold. The company is never a guardian.
        </Text>

        {/* Current guardians */}
        {guardians.length > 0 ? (
          <View style={styles.list}>
            {guardians.map((g) => (
              <GuardianCard key={g.address} guardian={g} onRemove={handleRemove} />
            ))}
          </View>
        ) : (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>No guardians set yet.</Text>
            <Text style={styles.emptyHint}>
              Add trusted contacts or devices as guardians for social recovery.
            </Text>
          </View>
        )}

        {/* Add guardian */}
        <View style={styles.addCard}>
          <Text style={styles.addTitle}>Add guardian</Text>
          <TextInput
            style={styles.input}
            placeholder="Wallet address (0x…)"
            placeholderTextColor={colors.text.tertiary}
            value={newAddress}
            onChangeText={setNewAddress}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <TextInput
            style={styles.input}
            placeholder="Label (optional)"
            placeholderTextColor={colors.text.tertiary}
            value={newLabel}
            onChangeText={setNewLabel}
          />
          <Button
            label="Add guardian"
            variant="secondary"
            size="md"
            fullWidth
            loading={adding}
            disabled={!newAddress.trim() || adding}
            onPress={handleAdd}
          />
        </View>
      </ScrollView>
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
  container: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing['3xl'] },
  description: {
    fontSize: typography.size.sm,
    color: colors.text.secondary,
    lineHeight: 22,
  },
  list: { gap: spacing.sm },
  emptyCard: {
    backgroundColor: colors.bg.elevated,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border.default,
  },
  emptyText: {
    fontSize: typography.size.base,
    fontWeight: typography.weight.semibold as '600',
    color: colors.text.primary,
  },
  emptyHint: { fontSize: typography.size.sm, color: colors.text.secondary },
  addCard: {
    backgroundColor: colors.bg.elevated,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.border.default,
  },
  addTitle: {
    fontSize: typography.size.base,
    fontWeight: typography.weight.semibold as '600',
    color: colors.text.primary,
  },
  input: {
    backgroundColor: colors.bg.overlay,
    borderRadius: radius.md,
    padding: spacing.md,
    color: colors.text.primary,
    fontSize: typography.size.base,
    borderWidth: 1,
    borderColor: colors.border.default,
  },
});
