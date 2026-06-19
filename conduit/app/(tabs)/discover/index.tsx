import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  Pressable,
  Alert,
  Clipboard,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { useWalletStore } from '@/store/wallet';
import { colors, spacing, typography, radius } from '@/theme/tokens';

export default function DiscoverScreen() {
  const myFingerprint = useWalletStore((s) => s.myFingerprint);
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    if (!myFingerprint) return;
    Clipboard.setString(myFingerprint);
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const chunks = myFingerprint
    ? [
        myFingerprint.slice(0, 16),
        myFingerprint.slice(16, 32),
        myFingerprint.slice(32, 48),
        myFingerprint.slice(48, 64),
      ]
    : [];

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>My Fingerprint</Text>
        <Text style={styles.subtitle}>
          Share your fingerprint so contacts can start an end-to-end encrypted conversation with you.
          Your fingerprint is derived from your messaging identity key — it reveals nothing about
          your wallet address.
        </Text>

        {myFingerprint ? (
          <>
            <View style={styles.card}>
              <View style={styles.fingerprintGrid}>
                {chunks.map((chunk, i) => (
                  <Text key={i} style={styles.chunk}>{chunk}</Text>
                ))}
              </View>
              <Pressable
                style={[styles.copyBtn, copied && styles.copyBtnDone]}
                onPress={handleCopy}
              >
                <Text style={styles.copyBtnText}>
                  {copied ? '✓ Copied' : 'Copy fingerprint'}
                </Text>
              </Pressable>
            </View>

            <View style={styles.infoCard}>
              <Text style={styles.infoTitle}>How to connect</Text>
              <View style={styles.steps}>
                <Step n={1} text="Copy your fingerprint above" />
                <Step n={2} text="Share it with your contact (message, email, or in person)" />
                <Step n={3} text="Your contact opens Conduit → Messages → + → pastes your fingerprint" />
                <Step n={4} text="End-to-end encrypted channel is established via Signal X3DH" />
              </View>
            </View>
          </>
        ) : (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>
              Complete wallet setup to see your fingerprint.
            </Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Step({ n, text }: { n: number; text: string }) {
  return (
    <View style={styles.step}>
      <View style={styles.stepNum}>
        <Text style={styles.stepNumText}>{n}</Text>
      </View>
      <Text style={styles.stepText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg.base },
  container: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing['3xl'] },
  title: {
    fontSize: typography.size['2xl'],
    fontWeight: typography.weight.bold as '700',
    color: colors.text.primary,
  },
  subtitle: {
    fontSize: typography.size.sm,
    color: colors.text.secondary,
    lineHeight: 20,
  },
  card: {
    backgroundColor: colors.bg.elevated,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border.default,
    overflow: 'hidden',
  },
  fingerprintGrid: {
    padding: spacing.lg,
    gap: spacing.sm,
    alignItems: 'center',
  },
  chunk: {
    fontFamily: 'Courier',
    fontSize: typography.size.base,
    color: colors.text.primary,
    letterSpacing: 2,
  },
  copyBtn: {
    backgroundColor: colors.brand.primary,
    margin: spacing.md,
    borderRadius: radius.md,
    padding: spacing.md,
    alignItems: 'center',
  },
  copyBtnDone: { backgroundColor: colors.success },
  copyBtnText: {
    color: colors.text.inverse,
    fontSize: typography.size.base,
    fontWeight: typography.weight.semibold as '600',
  },
  infoCard: {
    backgroundColor: colors.bg.elevated,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border.default,
    padding: spacing.lg,
    gap: spacing.md,
  },
  infoTitle: {
    fontSize: typography.size.base,
    fontWeight: typography.weight.semibold as '600',
    color: colors.text.primary,
  },
  steps: { gap: spacing.md },
  step: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' },
  stepNum: {
    width: 24,
    height: 24,
    borderRadius: radius.full,
    backgroundColor: colors.brand.primary,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    marginTop: 1,
  },
  stepNumText: {
    color: colors.text.inverse,
    fontSize: typography.size.xs,
    fontWeight: typography.weight.bold as '700',
  },
  stepText: {
    flex: 1,
    fontSize: typography.size.sm,
    color: colors.text.secondary,
    lineHeight: 20,
  },
  emptyCard: {
    backgroundColor: colors.bg.elevated,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border.default,
    padding: spacing.xl,
    alignItems: 'center',
  },
  emptyText: { color: colors.text.tertiary, fontSize: typography.size.sm },
});
