import React from 'react';
import { Pressable, Text, StyleSheet, ActivityIndicator, type PressableProps } from 'react-native';
import * as Haptics from 'expo-haptics';
import { colors, radius, spacing, typography, duration } from '@/theme/tokens';

type Variant = 'primary' | 'secondary' | 'ghost' | 'destructive';
type Size = 'sm' | 'md' | 'lg';

interface Props extends PressableProps {
  label: string;
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  fullWidth?: boolean;
}

export function Button({
  label,
  variant = 'primary',
  size = 'md',
  loading = false,
  fullWidth = false,
  onPress,
  disabled,
  style,
  ...rest
}: Props) {
  async function handlePress(e: Parameters<NonNullable<PressableProps['onPress']>>[0]) {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPress?.(e);
  }

  const isDisabled = disabled || loading;

  return (
    <Pressable
      {...rest}
      onPress={handlePress}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.base,
        styles[variant],
        styles[`size_${size}`],
        fullWidth && styles.fullWidth,
        isDisabled && styles.disabled,
        pressed && styles.pressed,
        style as object,
      ]}
    >
      {loading ? (
        <ActivityIndicator
          size="small"
          color={variant === 'primary' ? colors.text.inverse : colors.text.primary}
        />
      ) : (
        <Text style={[styles.label, styles[`labelSize_${size}`], styles[`labelVariant_${variant}`]]}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    flexDirection: 'row',
    gap: spacing.sm,
  },
  primary: {
    backgroundColor: colors.brand.primary,
  },
  secondary: {
    backgroundColor: colors.bg.elevated,
    borderWidth: 1,
    borderColor: colors.border.default,
  },
  ghost: {
    backgroundColor: 'transparent',
  },
  destructive: {
    backgroundColor: colors.error,
  },
  size_sm: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    minHeight: 36,
  },
  size_md: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm + 2,
    minHeight: 48,
  },
  size_lg: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    minHeight: 56,
  },
  fullWidth: { width: '100%' },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.75 },

  label: {
    fontWeight: typography.weight.semibold as '600',
  },
  labelSize_sm: { fontSize: typography.size.sm },
  labelSize_md: { fontSize: typography.size.base },
  labelSize_lg: { fontSize: typography.size.md },
  labelVariant_primary: { color: colors.text.inverse },
  labelVariant_secondary: { color: colors.text.primary },
  labelVariant_ghost: { color: colors.text.primary },
  labelVariant_destructive: { color: colors.text.inverse },
});
