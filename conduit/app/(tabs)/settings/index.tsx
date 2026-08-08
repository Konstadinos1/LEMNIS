import React from 'react';
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
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import * as SecureStore from 'expo-secure-store';
import { useWalletStore } from '@/store/wallet';
import { clearSessionJwt } from '@/lib/api/client';
import { colors, spacing, typography, radius } from '@/theme/tokens';

export default function SettingsScreen() {
  const account = useWalletStore((s) => s.account);
  const myFingerprint = useWalletStore((s) => s.myFingerprint);
  const reset = useWalletStore((s) => s.reset);

  function confirmReset() {
    Alert.alert(
      'Reset wallet',
      'This will remove your wallet and identity from this device. Make sure you have guardians set up for recovery. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: async () => {
            // Clear identity keys
            await SecureStore.deleteItemAsync('conduit.identity.dh');
            await SecureStore.deleteItemAsync('conduit.identity.ed');
            await SecureStore.deleteItemAsync('conduit.identity.spk');
            await SecureStore.deleteItemAsync('conduit.identity.regId');
            // Clear wallet
            await SecureStore.deleteItemAsync('conduit.wallet.address');
            await SecureStore.deleteItemAsync('conduit.passkey.credentialId');
            // Clear session + push
            await clearSessionJwt();
            await SecureStore.deleteItemAsync('conduit.notif.previewKey');
            await SecureStore.deleteItemAsync('conduit.notif.pushToken');
            reset();
            router.replace('/(auth)/onboarding');
          },
        },
      ]
    );
  }

  function copyFingerprint() {
    if (!myFingerprint) return;
    Clipboard.setString(myFingerprint);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Alert.alert('Copied', 'Your fingerprint has been copied to the clipboard. Share it with others so they can start an encrypted conversation with you.');
  }

  const shortAddress = account
    ? `${account.address.slice(0, 10)}…${account.address.slice(-8)}`
    : '—';

  const shortFingerprint = myFingerprint
    ? `${myFingerprint.slice(0, 8)}…${myFingerprint.slice(-8)}`
    : '—';

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>Settings</Text>

        {/* Account info */}
        <Section title="Account">
          <Row label="Wallet address" value={shortAddress} mono />
          <Row label="Network" value={account ? `Base (${account.chainId})` : '—'} />
          <Row label="Account type" value="ERC-4337 · Kernel v3" />
          <Row label="Deployed" value={account?.isDeployed ? 'Yes' : 'Counterfactual'} />
          <NavRow
            label="Messaging fingerprint"
            detail={shortFingerprint}
            mono
            onPress={copyFingerprint}
            hint="Tap to copy — share with contacts to start conversations"
          />
        </Section>

        {/* Security */}
        <Section title="Security">
          <NavRow
            label="Guardians & recovery"
            onPress={() => router.push('/(tabs)/settings/guardians')}
          />
          <NavRow
            label="Session keys"
            onPress={() => router.push('/(tabs)/settings/sessionKeys')}
          />
        </Section>

        {/* Privacy */}
        <Section title="Privacy">
          <Row label="Message encryption" value="Signal (Double Ratchet)" />
          <Row label="Relay access" value="Ciphertext only" />
          <Row label="Wallet-identity link" value="None (by design)" />
        </Section>

        {/* About */}
        <Section title="About">
          <Row label="Version" value="0.1.0" />
          <Row label="Chain" value="Base (OP Stack)" />
          <Row label="Bundler" value="Pimlico · ERC-4337 v0.7" />
        </Section>

        {/* Danger zone */}
        <Pressable style={styles.dangerBtn} onPress={confirmReset}>
          <Text style={styles.dangerBtnText}>Reset wallet on this device</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.card}>{children}</View>
    </View>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, mono && styles.mono]} numberOfLines={1}>{value}</Text>
    </View>
  );
}

function NavRow({
  label,
  detail,
  mono,
  hint,
  onPress,
}: {
  label: string;
  detail?: string;
  mono?: boolean;
  hint?: string;
  onPress: () => void;
}) {
  return (
    <Pressable style={[styles.row, hint ? styles.rowTall : null]} onPress={onPress}>
      <View style={styles.navRowBody}>
        <Text style={styles.rowLabel}>{label}</Text>
        {hint ? <Text style={styles.rowHint}>{hint}</Text> : null}
      </View>
      {detail ? (
        <Text style={[styles.rowValue, mono && styles.mono]} numberOfLines={1}>{detail}</Text>
      ) : (
        <Text style={styles.chevron}>›</Text>
      )}
    </Pressable>
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
  section: { gap: spacing.sm },
  sectionTitle: {
    fontSize: typography.size.xs,
    fontWeight: typography.weight.semibold as '600',
    color: colors.text.tertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    paddingHorizontal: spacing.xs,
  },
  card: {
    backgroundColor: colors.bg.elevated,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border.default,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.default,
  },
  rowTall: {
    paddingVertical: spacing.md,
  },
  navRowBody: { flex: 1, gap: 2 },
  rowLabel: { fontSize: typography.size.base, color: colors.text.primary },
  rowHint: { fontSize: typography.size.xs, color: colors.text.tertiary, marginTop: 2 },
  rowValue: {
    fontSize: typography.size.sm,
    color: colors.text.secondary,
    maxWidth: '45%',
    textAlign: 'right',
  },
  mono: { fontFamily: 'Courier', fontSize: typography.size.xs },
  chevron: { color: colors.text.tertiary, fontSize: typography.size.lg },
  dangerBtn: {
    backgroundColor: colors.bg.elevated,
    borderRadius: radius.lg,
    padding: spacing.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.error,
    marginTop: spacing.md,
  },
  dangerBtnText: {
    color: colors.error,
    fontSize: typography.size.base,
    fontWeight: typography.weight.medium as '500',
  },
});
