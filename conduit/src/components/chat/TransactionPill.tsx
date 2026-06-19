import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import * as Haptics from 'expo-haptics';
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';
import { colors, radius, spacing, typography, spring } from '@/theme/tokens';
import type { TxStatus } from '@/types/message';

interface Props {
  txHash: string;
  status: TxStatus;
  chainId: number;
  onPress?: () => void;
}

const STATUS_CONFIG: Record<TxStatus, { label: string; color: string; dotColor: string }> = {
  pending: { label: 'Pending', color: colors.warning, dotColor: colors.warning },
  confirmed: { label: 'Confirmed', color: colors.success, dotColor: colors.success },
  failed: { label: 'Failed', color: colors.error, dotColor: colors.error },
};

export function TransactionPill({ txHash, status, onPress }: Props) {
  const cfg = STATUS_CONFIG[status];
  const scale = useSharedValue(1);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  function handlePress() {
    scale.value = withSpring(0.96, spring.snappy, () => {
      scale.value = withSpring(1, spring.snappy);
    });
    Haptics.selectionAsync();
    onPress?.();
  }

  const shortHash = `${txHash.slice(0, 6)}…${txHash.slice(-4)}`;

  return (
    <Pressable onPress={handlePress}>
      <Animated.View style={[styles.pill, animStyle]}>
        <View style={[styles.dot, { backgroundColor: cfg.dotColor }]} />
        <Text style={[styles.statusText, { color: cfg.color }]}>{cfg.label}</Text>
        <Text style={styles.hashText}>{shortHash}</Text>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.bg.elevated,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: colors.border.default,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: radius.full,
  },
  statusText: {
    fontSize: typography.size.xs,
    fontWeight: typography.weight.semibold as '600',
  },
  hashText: {
    fontSize: typography.size.xs,
    color: colors.text.tertiary,
    fontFamily: typography.family.mono,
  },
});
