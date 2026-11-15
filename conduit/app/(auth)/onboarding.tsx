import React, { useState } from 'react';
import { View, Text, StyleSheet, SafeAreaView } from 'react-native';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Button } from '@/components/ui/Button';
import { colors, spacing, typography } from '@/theme/tokens';

type Step = 'welcome' | 'privacy' | 'create_wallet';

export default function OnboardingScreen() {
  const [step, setStep] = useState<Step>('welcome');

  async function advance() {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (step === 'welcome') setStep('privacy');
    else if (step === 'privacy') setStep('create_wallet');
    else router.replace('/(auth)/create-wallet');
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        {step === 'welcome' && (
          <>
            <Text style={styles.title}>Conduit</Text>
            <Text style={styles.subtitle}>
              Chat and swap, in one encrypted thread.{'\n'}Your keys. Your funds. Always.
            </Text>
          </>
        )}

        {step === 'privacy' && (
          <>
            <Text style={styles.title}>End-to-end encrypted</Text>
            <Text style={styles.subtitle}>
              Every message is encrypted on your device before it leaves.
              {'\n\n'}On-chain transactions are public by design — we always tell you which is which.
            </Text>
          </>
        )}

        {step === 'create_wallet' && (
          <>
            <Text style={styles.title}>Your wallet, your key</Text>
            <Text style={styles.subtitle}>
              We will create a smart-contract wallet secured by Face ID / fingerprint.
              {'\n\n'}No seed phrase. No custody. We cannot move your funds.
            </Text>
          </>
        )}

        <View style={styles.actions}>
          <Button label="Continue" variant="primary" size="lg" fullWidth onPress={advance} />
        </View>
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
    fontSize: typography.size['3xl'],
    fontWeight: typography.weight.bold as '700',
    color: colors.text.primary,
  },
  subtitle: {
    fontSize: typography.size.md,
    color: colors.text.secondary,
    lineHeight: 26,
  },
  actions: { marginTop: spacing['2xl'] },
});
