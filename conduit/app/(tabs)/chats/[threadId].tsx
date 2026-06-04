import React, { useRef, useState, useEffect } from 'react';
import {
  View,
  TextInput,
  StyleSheet,
  Pressable,
  Text,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { MessageList } from '@/components/chat/MessageList';
import { SwapSheet } from '@/components/swap/SwapSheet';
import { useChatStore } from '@/store/chat';
import { useSwapStore } from '@/store/swap';
import { useWalletStore } from '@/store/wallet';
import { useThreadMessages } from '@/hooks/useMessages';
import { useSendMessage } from '@/hooks/useSendMessage';
import { colors, spacing, typography, radius } from '@/theme/tokens';

export default function ThreadScreen() {
  const { threadId } = useLocalSearchParams<{ threadId: string }>();
  const [draft, setDraft] = useState('');
  const wsRef = useRef<WebSocket | null>(null);

  const messages = useChatStore((s) => s.messages[threadId] ?? []);
  const thread = useChatStore((s) => s.threads[threadId]);
  const markRead = useChatStore((s) => s.markRead);
  const myId = useWalletStore((s) => s.account?.address ?? '');
  const openSwapSheet = useSwapStore((s) => s.openSwapSheet);

  useThreadMessages(threadId, wsRef);

  useEffect(() => {
    markRead(threadId);
  }, [threadId, markRead]);

  const sendMessage = useSendMessage(threadId, wsRef);

  async function handleSend() {
    const text = draft.trim();
    if (!text) return;
    setDraft('');
    await sendMessage(text);
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }

  const participantLabel = thread?.participants
    .filter((p) => p !== myId)
    .map((p) => `${p.slice(0, 6)}…${p.slice(-4)}`)
    .join(', ') ?? threadId.slice(0, 8) + '…';

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaView style={styles.safe}>
        {/* Header */}
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backBtn}>
            <Text style={styles.back}>‹</Text>
          </Pressable>
          <View style={styles.headerInfo}>
            <Text style={styles.threadTitle} numberOfLines={1}>{participantLabel}</Text>
            <Text style={styles.encryptedLabel}>🔒 End-to-end encrypted</Text>
          </View>
          <Pressable style={styles.swapHeaderBtn} onPress={() => openSwapSheet(threadId)}>
            <Text style={styles.swapHeaderBtnText}>⇄ Swap</Text>
          </Pressable>
        </View>

        {/* Message list */}
        <View style={styles.listContainer}>
          <MessageList messages={messages} myId={myId} />
        </View>

        {/* Composer */}
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={styles.composer}>
            <Pressable style={styles.swapBtn} onPress={() => openSwapSheet(threadId)}>
              <Text style={styles.swapBtnText}>⇄</Text>
            </Pressable>
            <TextInput
              style={styles.input}
              value={draft}
              onChangeText={setDraft}
              placeholder="Message"
              placeholderTextColor={colors.text.tertiary}
              multiline
              returnKeyType="send"
              blurOnSubmit={false}
              onSubmitEditing={handleSend}
            />
            <Pressable
              style={[styles.sendBtn, !draft.trim() && styles.sendBtnDisabled]}
              onPress={handleSend}
              disabled={!draft.trim()}
            >
              <Text style={styles.sendBtnText}>↑</Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>

        {/* Inline swap sheet */}
        <SwapSheet />
      </SafeAreaView>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  safe: { flex: 1, backgroundColor: colors.bg.base },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.default,
    gap: spacing.sm,
  },
  backBtn: { padding: spacing.xs },
  back: { fontSize: 28, color: colors.brand.primary, fontWeight: '300' },
  headerInfo: { flex: 1 },
  threadTitle: {
    fontSize: typography.size.base,
    fontWeight: typography.weight.semibold as '600',
    color: colors.text.primary,
  },
  encryptedLabel: { fontSize: typography.size.xs, color: colors.text.tertiary },
  swapHeaderBtn: {
    backgroundColor: colors.brand.primary,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  swapHeaderBtnText: {
    color: colors.text.inverse,
    fontSize: typography.size.sm,
    fontWeight: typography.weight.semibold as '600',
  },
  listContainer: { flex: 1 },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: spacing.sm,
    gap: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border.default,
    backgroundColor: colors.bg.base,
  },
  swapBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    backgroundColor: colors.bg.elevated,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border.default,
  },
  swapBtnText: { color: colors.brand.primary, fontSize: typography.size.lg },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 120,
    backgroundColor: colors.bg.elevated,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    color: colors.text.primary,
    fontSize: typography.size.base,
    borderWidth: 1,
    borderColor: colors.border.default,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    backgroundColor: colors.brand.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: { backgroundColor: colors.bg.subtle },
  sendBtnText: {
    color: colors.text.inverse,
    fontSize: typography.size.lg,
    fontWeight: typography.weight.bold as '700',
  },
});
