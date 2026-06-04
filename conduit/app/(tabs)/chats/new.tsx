import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  SafeAreaView,
  Pressable,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useChatStore } from '@/store/chat';
import { useWalletStore } from '@/store/wallet';
import { ratchetInitAlice } from '@/lib/crypto/doubleRatchet';
import { x3dhInitiate, type PreKeyBundle } from '@/lib/crypto/x3dh';
import { loadIdentity } from '@/lib/crypto/identity';
import { MMKV } from 'react-native-mmkv';
import { serializeState } from '@/lib/crypto/doubleRatchet';
import { Button } from '@/components/ui/Button';
import { colors, spacing, typography, radius } from '@/theme/tokens';

const storage = new MMKV();
const API = process.env.EXPO_PUBLIC_API_BASE_URL ?? 'https://api.conduit.app';

type Step = 'enter_address' | 'establishing' | 'done';

export default function NewThreadScreen() {
  const [address, setAddress] = useState('');
  const [step, setStep] = useState<Step>('enter_address');
  const upsertThread = useChatStore((s) => s.upsertThread);
  const myAddress = useWalletStore((s) => s.account?.address ?? '');

  async function handleStartConversation() {
    const peer = address.trim().toLowerCase();
    if (!peer) return;

    // Validate: 0x + 40 hex chars
    if (!/^0x[0-9a-f]{40}$/i.test(peer)) {
      Alert.alert('Invalid address', 'Enter a valid 0x Ethereum address.');
      return;
    }

    if (peer === myAddress.toLowerCase()) {
      Alert.alert('Invalid', 'You cannot message yourself.');
      return;
    }

    setStep('establishing');
    try {
      // Fetch Bob's pre-key bundle from relay
      const res = await fetch(
        `${API}/api/prekeys/${peer.replace('0x', '')}`,
        { headers: { Accept: 'application/json' } }
      );

      if (!res.ok) throw new Error('Peer not found or not registered on Conduit.');
      const bundle = await res.json() as PreKeyBundle;

      // Load our identity
      const myIdentity = await loadIdentity();
      if (!myIdentity) throw new Error('Local identity not found. Please restart the app.');

      // X3DH session establishment
      const { sharedSecret, initMessage } = await x3dhInitiate(myIdentity, bundle);

      // Initialise Double Ratchet (Alice side)
      const ratchetState = await ratchetInitAlice(sharedSecret, bundle.signedPreKey);
      storage.set(`ratchet:${peer}`, serializeState(ratchetState));

      // Create the thread in local state
      const threadId = [myAddress.toLowerCase(), peer].sort().join('-');
      upsertThread({
        id: threadId,
        participants: [myAddress, peer],
        unreadCount: 0,
      });

      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setStep('done');

      router.replace(`/(tabs)/chats/${threadId}`);
    } catch (e) {
      Alert.alert('Error', (e as Error).message);
      setStep('enter_address');
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <Pressable onPress={() => router.back()}>
            <Text style={styles.cancel}>Cancel</Text>
          </Pressable>
          <Text style={styles.title}>New Message</Text>
          <View style={{ width: 60 }} />
        </View>

        {step === 'establishing' ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.brand.primary} size="large" />
            <Text style={styles.estText}>
              Establishing encrypted session…
            </Text>
          </View>
        ) : (
          <>
            <Text style={styles.label}>Recipient address</Text>
            <TextInput
              style={styles.input}
              placeholder="0x…"
              placeholderTextColor={colors.text.tertiary}
              value={address}
              onChangeText={setAddress}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="done"
            />
            <Text style={styles.hint}>
              Enter the wallet address of a Conduit user. An end-to-end encrypted session
              will be established using the Signal X3DH protocol.
            </Text>

            <Button
              label="Start encrypted conversation"
              variant="primary"
              size="lg"
              fullWidth
              disabled={!address.trim()}
              onPress={handleStartConversation}
            />
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg.base },
  container: { flex: 1, padding: spacing.lg, gap: spacing.md },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  cancel: { color: colors.brand.primary, fontSize: typography.size.base },
  title: {
    fontSize: typography.size.md,
    fontWeight: typography.weight.semibold as '600',
    color: colors.text.primary,
  },
  label: {
    fontSize: typography.size.sm,
    color: colors.text.secondary,
    fontWeight: typography.weight.medium as '500',
  },
  input: {
    backgroundColor: colors.bg.elevated,
    borderRadius: radius.md,
    padding: spacing.md,
    color: colors.text.primary,
    fontSize: typography.size.base,
    fontFamily: 'Courier',
    borderWidth: 1,
    borderColor: colors.border.default,
  },
  hint: {
    fontSize: typography.size.sm,
    color: colors.text.tertiary,
    lineHeight: 20,
  },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.lg },
  estText: { color: colors.text.secondary, fontSize: typography.size.base },
});
