import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import * as Haptics from 'expo-haptics';
import { colors, spacing, typography, radius } from '@/theme/tokens';
import type { Guardian } from '@/types/wallet';

interface Props {
  guardian: Guardian;
  onRemove: (address: string) => void;
}

export function GuardianCard({ guardian, onRemove }: Props) {
  async function handleRemove() {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onRemove(guardian.address);
  }

  const shortAddr = `${guardian.address.slice(0, 8)}…${guardian.address.slice(-6)}`;

  return (
    <View style={styles.card}>
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>{guardian.label.slice(0, 2).toUpperCase()}</Text>
      </View>
      <View style={styles.info}>
        <Text style={styles.label}>{guardian.label}</Text>
        <Text style={styles.address}>{shortAddr}</Text>
        <Text style={styles.since}>
          Added {new Date(guardian.addedAt).toLocaleDateString()}
        </Text>
      </View>
      <Pressable style={styles.removeBtn} onPress={handleRemove}>
        <Text style={styles.removeBtnText}>Remove</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bg.elevated,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.border.default,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    backgroundColor: colors.brand.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: colors.text.inverse,
    fontWeight: typography.weight.bold as '700',
    fontSize: typography.size.sm,
  },
  info: { flex: 1, gap: 2 },
  label: {
    fontSize: typography.size.base,
    fontWeight: typography.weight.semibold as '600',
    color: colors.text.primary,
  },
  address: {
    fontFamily: 'Courier',
    fontSize: typography.size.xs,
    color: colors.text.secondary,
  },
  since: { fontSize: typography.size.xs, color: colors.text.tertiary },
  removeBtn: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.error,
  },
  removeBtnText: {
    color: colors.error,
    fontSize: typography.size.xs,
    fontWeight: typography.weight.medium as '500',
  },
});
