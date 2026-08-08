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
import { loadIdentity, fingerprintFromDhKeyAsync, getMyFingerprint } from '@/lib/crypto/identity';
import { MMKV } from 'react-native-mmkv';
import { serializeState } from '@/lib/crypto/doubleRatchet';
import { Button } from '@/components/ui/Button';
import { colors, spacing, typography, radius } from '@/theme/tokens';
import { ensureApiSession } from '@/lib/api/auth';
import { apiPost } from '@/lib/api/client';
import { replenishOtks } from '@/lib/crypto/identity';

const storage = new MMKV();
const API = process.env.EXPO_PUBLIC_API_BASE_URL ?? 'https://api.conduit.app';

type Step = 'enter_fingerprint' | 'establishing' | 'done';

export default function NewThreadScreen() {
  const [fingerprint, setFingerprint] = useState('');
  const [step, setStep] = useState<Step>('enter_fingerprint');
  const upsertThread = useChatStore((s) => s.upsertThread);
  const myAddress = useWalletStore((s) => s.account?.address ?? '');

  async function handleStartConversation() {
    const peer = fingerprint.trim().toLowerCase();
    if (!peer) return;

    // Fingerprint = lowercase hex(SHA-256(X25519 DH key)) — 64 hex chars
    if (!/^[0-9a-f]{64}$/.test(peer)) {
      Alert.alert('Invalid fingerprint', 'Enter the recipient\'s 64-character hex fingerprint.');
      return;
    }

    const myFingerprint = await getMyFingerprint();
    if (peer === myFingerprint) {
      Alert.alert('Invalid', 'You cannot message yourself.');
      return;
    }

    setStep('establishing');
    try {
      // Authenticated fetch — the prekeys endpoint requires a valid API session
      const jwt = await ensureApiSession();
      const res = await fetch(
        `${API}/api/prekeys/${peer}`,
        { headers: { Accept: 'application/json', Authorization: `Bearer ${jwt}` } }
      );

      if (res.status === 404) throw new Error('Recipient not found — ask them to share their Conduit fingerprint.');
      if (!res.ok) throw new Error('Could not reach the server. Please try again.');
      const raw = await res.json() as Record<string, unknown>;

      // Server returns binary fields as number[] (JSON-serialised bytes); coerce to Uint8Array
      const bundle: PreKeyBundle = {
        registrationId:        raw.registrationId as number,
        identityKeyDh:         new Uint8Array(raw.identityKeyDh as number[]),
        identityKeyEd:         new Uint8Array(raw.identityKeyEd as number[]),
        signedPreKeyId:        raw.signedPreKeyId as number,
        signedPreKey:          new Uint8Array(raw.signedPreKey as number[]),
        signedPreKeySignature: new Uint8Array(raw.signedPreKeySignature as number[]),
        kyberPreKeyId:         raw.kyberPreKeyId as number,
        kyberPreKey:           new Uint8Array(raw.kyberPreKey as number[]),
        kyberPreKeySig:        new Uint8Array(raw.kyberPreKeySig as number[]),
        oneTimePreKeyId:       raw.oneTimePreKeyId as number | undefined,
        oneTimePreKey:         raw.oneTimePreKey ? new Uint8Array(raw.oneTimePreKey as number[]) : undefined,
        otkRemaining:          raw.otkRemaining as number | undefined,
      };

      // Load our identity
      const myIdentity = await loadIdentity();
      if (!myIdentity) throw new Error('Local identity not found. Please restart the app.');

      // Compute thread ID first — used as MMKV key prefix
      const threadId = [myFingerprint ?? myAddress.toLowerCase(), peer].sort().join('-');

      // X3DH session establishment
      const { sharedSecret, initMessage } = await x3dhInitiate(myIdentity, bundle);

      // Initialise Double Ratchet (Alice side)
      const ratchetState = await ratchetInitAlice(sharedSecret, bundle.signedPreKey);
      storage.set(`ratchet:${threadId}`, serializeState(ratchetState));

      // Store X3DH init message — delivered inside the first message envelope
      // so Bob can run x3dhRespond() and initialise his ratchet.
      storage.set(`x3dhInit:${threadId}`, JSON.stringify({
        identityKeyDh:   Array.from(initMessage.identityKeyDh),
        ephemeralKey:    Array.from(initMessage.ephemeralKey),
        signedPreKeyId:  initMessage.signedPreKeyId,
        kyberCiphertext: Array.from(initMessage.kyberCiphertext),
        kyberPreKeyId:   initMessage.kyberPreKeyId,
        oneTimePreKeyId: initMessage.oneTimePreKeyId ?? null,
      }));

      // Replenish OTKs in the background when the relay reports fewer than 5 remaining.
      // Fire-and-forget — a failed replenishment is non-fatal.
      if ((bundle.otkRemaining ?? 10) < 5) {
        void replenishOtks(10).then((otks) =>
          apiPost('/api/prekeys/replenish', {
            oneTimePreKeys: otks.map((k) => ({
              keyId: k.keyId,
              publicKey: Array.from(k.publicKey),
            })),
          })
        ).catch(() => {});
      }

      // bundle.identityKeyDh lets us re-derive the peer fingerprint and verify it matches
      const peerFingerprint = await fingerprintFromDhKeyAsync(bundle.identityKeyDh);
      if (peerFingerprint !== peer) {
        throw new Error('Bundle fingerprint mismatch — possible relay tampering. Aborting.');
      }

      upsertThread({
        id: threadId,
        participants: [myAddress, peer],
        participantFingerprints: [
          ...(myFingerprint ? [myFingerprint] : []),
          peerFingerprint,
        ],
        unreadCount: 0,
      });


      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setStep('done');

      router.replace(`/(tabs)/chats/${threadId}`);
    } catch (e) {
      Alert.alert('Error', (e as Error).message);
      setStep('enter_fingerprint');
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
            <Text style={styles.label}>Recipient fingerprint</Text>
            <TextInput
              style={styles.input}
              placeholder="64-character hex fingerprint"
              placeholderTextColor={colors.text.tertiary}
              value={fingerprint}
              onChangeText={setFingerprint}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="done"
            />
            <Text style={styles.hint}>
              Enter the recipient&apos;s Conduit fingerprint — they can share it from their
              profile screen. An end-to-end encrypted session will be established using
              the Signal X3DH protocol.
            </Text>

            <Button
              label="Start encrypted conversation"
              variant="primary"
              size="lg"
              fullWidth
              disabled={fingerprint.trim().length !== 64}
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
