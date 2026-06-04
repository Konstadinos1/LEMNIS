import React, { useState, useCallback } from 'react';
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
import { colors, spacing, typography, radius } from '@/theme/tokens';

export default function ThreadScreen() {
  const { threadId } = useLocalSearchParams<{ threadId: string }>();
  const [draft, setDraft] = useState('');

  const messages = useChatStore((s) => s.messages[threadId] ?? []);
  const appendMessage = useChatStore((s) => s.appendMessage);
  const myId = useWalletStore((s) => s.account?.address ?? '');
  const openSwapSheet = useSwapStore((s) => s.openSwapSheet);

  useThreadMessages(threadId);

  const sendMessage = useCallback(async () => {
    const text = draft.trim();
    if (!text) return;
    setDraft('');

    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    // In production, this goes through the Double Ratchet encrypt → relay path.
    appendMessage(threadId, {
      id: crypto.randomUUID(),
      threadId,
      senderId: myId,
      timestamp: Date.now(),
      type: 'text',
      ciphertext: '',
      plaintext: text,
    });
  }, [draft, threadId, myId, appendMessage]);

  function handleSwap() {
    openSwapSheet(threadId);
  }

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaView style={styles.safe}>
        {/* Header */}
        <View style={styles.header}>
          <Pressable onPress={() => router.back()}>
            <Text style={styles.back}>‹</Text>
          </Pressable>
          <Text style={styles.threadTitle} numberOfLines={1}>
            {threadId.slice(0, 8)}…
          </Text>
        </View>

        {/* Message list — FlashList with multiple recycling pools */}
        <View style={styles.listContainer}>
          <MessageList messages={messages} myId={myId} />
        </View>

        {/* Composer */}
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={0}
        >
          <View style={styles.composer}>
            <Pressable style={styles.swapBtn} onPress={handleSwap}>
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
              onSubmitEditing={sendMessage}
            />
            <Pressable style={styles.sendBtn} onPress={sendMessage}>
              <Text style={styles.sendBtnText}>↑</Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>

        {/* Inline swap sheet — overlays the thread without unmounting it */}
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
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.default,
    gap: spacing.md,
  },
  back: {
    fontSize: 28,
    color: colors.brand.primary,
    fontWeight: '300',
  },
  threadTitle: {
    flex: 1,
    fontSize: typography.size.base,
    fontWeight: typography.weight.semibold as '600',
    color: colors.text.primary,
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
  swapBtnText: {
    color: colors.brand.primary,
    fontSize: typography.size.lg,
    fontWeight: typography.weight.bold as '700',
  },
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
  sendBtnText: {
    color: colors.text.inverse,
    fontSize: typography.size.lg,
    fontWeight: typography.weight.bold as '700',
  },
});
