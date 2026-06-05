import React, { useState } from 'react';
import { View, Text, StyleSheet, SafeAreaView } from 'react-native';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { createSmartAccount } from '@/lib/wallet/smartAccount';
import { generateAndStoreIdentity, getMyFingerprint } from '@/lib/crypto/identity';
import { acquireApiSession } from '@/lib/api/auth';
import { apiPost } from '@/lib/api/client';
import { useWalletStore } from '@/store/wallet';
import { Button } from '@/components/ui/Button';
import { colors, spacing, typography } from '@/theme/tokens';

type State = 'idle' | 'creating' | 'done' | 'error';

export default function CreateWalletScreen() {
  const [state, setState] = useState<State>('idle');
  const [step, setStep] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const setAccount = useWalletStore((s) => s.setAccount);
  const setMyFingerprint = useWalletStore((s) => s.setMyFingerprint);

  async function handleCreate() {
    setState('creating');
    setErrorMsg('');
    try {
      // Step 1: Generate Signal identity (Ed25519/X25519) + pre-keys
      setStep('Generating identity keys…');
      const identity = await generateAndStoreIdentity();

      // Step 2: Create passkey + derive Kernel v3 smart account address
      setStep('Creating passkey in Secure Enclave…');
      const account = await createSmartAccount();
      setAccount(account);

      // Step 3: Authenticate with the API to get a session JWT
      setStep('Authenticating with relay…');
      await acquireApiSession();

      // Persist fingerprint in store so all screens can read it synchronously
      const fp = await getMyFingerprint();
      setMyFingerprint(fp);

      // Step 4: Upload prekey bundle — required for others to initiate sessions
      setStep('Registering encrypted identity…');
      await apiPost('/api/prekeys/register', {
        identityKeyDh: Array.from(identity.identityKeyDh.publicKey),
        identityKeyEd: Array.from(identity.identityKeyEd.publicKey),
        registrationId: identity.registrationId,
        deviceId: 1,
        signedPreKey: {
          keyId: identity.signedPreKey.keyId,
          publicKey: Array.from(identity.signedPreKey.keyPair.publicKey),
          signature: Array.from(identity.signedPreKey.signature),
        },
        kyberPreKey: { keyId: 0, publicKey: [], signature: [] }, // PQXDH: TODO
        oneTimePreKeys: identity.oneTimePreKeys.slice(0, 10).map((k, i) => ({
          keyId: i,
          publicKey: Array.from(k.publicKey),
        })),
      });

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
        <Text style={styles.title}>Create your wallet</Text>

        <View style={styles.featureList}>
          {[
            ['🔐', 'Secured by Face ID / fingerprint', 'Key never leaves your device'],
            ['🚫', 'No seed phrase', 'Social recovery if you lose access'],
            ['⛽', 'Gas sponsored', 'We cover network fees for your swaps'],
          ].map(([icon, heading, sub]) => (
            <View key={heading} style={styles.featureRow}>
              <Text style={styles.featureIcon}>{icon}</Text>
              <View>
                <Text style={styles.featureHeading}>{heading}</Text>
                <Text style={styles.featureSub}>{sub}</Text>
              </View>
            </View>
          ))}
        </View>

        {state === 'creating' && step ? (
          <Text style={styles.stepText}>{step}</Text>
        ) : null}

        {state === 'error' ? (
          <Text style={styles.error}>{errorMsg}</Text>
        ) : null}

        <Button
          label="Create wallet with Face ID"
          variant="primary"
          size="lg"
          fullWidth
          loading={state === 'creating'}
          disabled={state === 'creating'}
          onPress={handleCreate}
        />

        <Text style={styles.disclaimer}>
          We cannot move your funds or read your messages.
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg.base },
  container: { flex: 1, padding: spacing.xl, justifyContent: 'center', gap: spacing.lg },
  title: {
    fontSize: typography.size['2xl'],
    fontWeight: typography.weight.bold as '700',
    color: colors.text.primary,
  },
  featureList: { gap: spacing.md },
  featureRow: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' },
  featureIcon: { fontSize: typography.size.xl, width: 32, textAlign: 'center' },
  featureHeading: {
    fontSize: typography.size.base,
    fontWeight: typography.weight.semibold as '600',
    color: colors.text.primary,
  },
  featureSub: { fontSize: typography.size.sm, color: colors.text.secondary },
  stepText: { fontSize: typography.size.sm, color: colors.text.secondary, textAlign: 'center' },
  error: { color: colors.error, fontSize: typography.size.sm, textAlign: 'center' },
  disclaimer: {
    fontSize: typography.size.xs,
    color: colors.text.tertiary,
    textAlign: 'center',
    lineHeight: 18,
  },
});
