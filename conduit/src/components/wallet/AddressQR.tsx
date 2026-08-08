import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { colors, spacing, typography, radius } from '@/theme/tokens';

interface Props {
  address: string;
}

export function AddressQR({ address }: Props) {
  async function handleCopy() {
    await Clipboard.setStringAsync(address);
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }

  const short = `${address.slice(0, 10)}…${address.slice(-8)}`;

  return (
    <View style={styles.container}>
      <View style={styles.qrWrapper}>
        <QRCode
          value={address}
          size={200}
          backgroundColor={colors.bg.elevated}
          color={colors.text.primary}
        />
      </View>
      <Pressable style={styles.addressChip} onPress={handleCopy}>
        <Text style={styles.addressText}>{short}</Text>
        <Text style={styles.copyHint}>Tap to copy</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', gap: spacing.lg },
  qrWrapper: {
    padding: spacing.md,
    backgroundColor: colors.bg.elevated,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border.default,
  },
  addressChip: {
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.bg.overlay,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  addressText: {
    fontFamily: 'Courier',
    fontSize: typography.size.sm,
    color: colors.text.primary,
    letterSpacing: 0.5,
  },
  copyHint: { fontSize: typography.size.xs, color: colors.text.tertiary },
});
