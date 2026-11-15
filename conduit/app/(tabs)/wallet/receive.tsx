import React from 'react';
import { View, Text, StyleSheet, SafeAreaView, Pressable } from 'react-native';
import { router } from 'expo-router';
import { useWalletStore } from '@/store/wallet';
import { AddressQR } from '@/components/wallet/AddressQR';
import { colors, spacing, typography } from '@/theme/tokens';

export default function ReceiveScreen() {
  const account = useWalletStore((s) => s.account);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()}>
          <Text style={styles.back}>‹ Back</Text>
        </Pressable>
        <Text style={styles.title}>Receive</Text>
        <View style={{ width: 60 }} />
      </View>

      <View style={styles.container}>
        <Text style={styles.subtitle}>
          Share your address to receive assets on Base.{'\n'}
          On-chain transactions are public and permanent.
        </Text>
        {account ? (
          <AddressQR address={account.address} />
        ) : (
          <Text style={styles.empty}>Wallet not loaded.</Text>
        )}
      </View>
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
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    gap: spacing.xl,
  },
  subtitle: {
    fontSize: typography.size.sm,
    color: colors.text.secondary,
    textAlign: 'center',
    lineHeight: 22,
  },
  empty: { color: colors.text.tertiary },
});
