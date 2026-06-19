import React, { useState } from 'react';
import { View, Text, StyleSheet, SafeAreaView, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import * as LocalAuthentication from 'expo-local-authentication';
import * as Haptics from 'expo-haptics';
import { saveAccountAddress } from '@/crypto/wallet';
import { useWalletStore } from '@/store/wallet';
import { Button } from '@/components/ui/Button';
import { colors, spacing, typography } from '@/theme/tokens';

type State = 'idle' | 'creating' | 'done' | 'error';

export default function CreateWalletScreen() {
  const [state, setState] = useState<State>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const setAccount = useWalletStore((s) => s.setAccount);

  async function handleCreate() {
    setState('creating');
    try {
      // 1. Biometric gate
      const bio = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Create your Conduit wallet',
      });
      if (!bio.success) { setState('idle'); return; }

      // 2. Create passkey + deploy (or counterfactual) smart account
      //    In production this calls the native JSI module → Kernel v3 factory.
      //    Here we simulate with a placeholder address.
      await new Promise((r) => setTimeout(r, 1500));
      const address = '0x0000000000000000000000000000000000000001' as `0x${string}`;
      await saveAccountAddress(address);
      setAccount({ address, isDeployed: false, chainId: 8453 });

      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setState('done');
      router.replace('/(tabs)/chats');
    } catch (e) {
      setErrorMsg((e as Error).message);
      setState('error');
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <Text style={styles.title}>Create wallet</Text>
        <Text style={styles.subtitle}>
          Your wallet is secured by Face ID / fingerprint.
          The signing key never leaves your device.
        </Text>

        {state === 'creating' && (
          <ActivityIndicator color={colors.brand.primary} size="large" />
        )}

        {state === 'error' && (
          <Text style={styles.error}>{errorMsg}</Text>
        )}

        <Button
          label="Create with Face ID"
          variant="primary"
          size="lg"
          fullWidth
          loading={state === 'creating'}
          disabled={state === 'creating'}
          onPress={handleCreate}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg.base },
  container: {
    flex: 1,
    padding: spacing.xl,
    justifyContent: 'center',
    gap: spacing.lg,
  },
  title: {
    fontSize: typography.size['2xl'],
    fontWeight: typography.weight.bold as '700',
    color: colors.text.primary,
  },
  subtitle: {
    fontSize: typography.size.base,
    color: colors.text.secondary,
    lineHeight: 24,
  },
  error: {
    color: colors.error,
    fontSize: typography.size.sm,
    textAlign: 'center',
  },
});
