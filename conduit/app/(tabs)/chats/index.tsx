import React from 'react';
import { View, Text, FlatList, Pressable, StyleSheet, SafeAreaView } from 'react-native';
import { router } from 'expo-router';
import { useChatStore } from '@/store/chat';
import { colors, spacing, typography, radius } from '@/theme/tokens';
import type { Thread } from '@/types/message';

export default function ChatsScreen() {
  const threads = useChatStore((s) => Object.values(s.threads));

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Text style={styles.title}>Messages</Text>
        <Pressable
          style={styles.newBtn}
          onPress={() => router.push('/(tabs)/chats/new')}
        >
          <Text style={styles.newBtnText}>+</Text>
        </Pressable>
      </View>
      <FlatList
        data={threads.sort((a, b) => {
          const ta = a.lastMessage?.timestamp ?? 0;
          const tb = b.lastMessage?.timestamp ?? 0;
          return tb - ta;
        })}
        keyExtractor={(t) => t.id}
        renderItem={({ item }) => <ThreadRow thread={item} />}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyTitle}>No messages yet</Text>
            <Text style={styles.emptyBody}>
              Start an encrypted conversation by tapping +
            </Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}

function ThreadRow({ thread }: { thread: Thread }) {
  const initials = thread.id.slice(0, 2).toUpperCase();
  const preview =
    thread.lastMessage?.type === 'text'
      ? thread.lastMessage.plaintext
      : thread.lastMessage?.type === 'swap_receipt'
      ? '🔄 Swap'
      : '';

  return (
    <Pressable
      style={styles.row}
      onPress={() => router.push(`/(tabs)/chats/${thread.id}`)}
    >
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>{initials}</Text>
      </View>
      <View style={styles.rowBody}>
        <Text style={styles.participantText} numberOfLines={1}>
          {thread.participants.map((p) => `${p.slice(0, 6)}…${p.slice(-4)}`).join(', ')}
        </Text>
        {preview ? (
          <Text style={styles.preview} numberOfLines={1}>{preview}</Text>
        ) : null}
      </View>
      <View style={styles.rowMeta}>
        {thread.lastMessage ? (
          <Text style={styles.time}>
            {new Date(thread.lastMessage.timestamp).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </Text>
        ) : null}
        {thread.unreadCount > 0 ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{thread.unreadCount}</Text>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg.base },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  title: {
    fontSize: typography.size['2xl'],
    fontWeight: typography.weight.bold as '700',
    color: colors.text.primary,
  },
  newBtn: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    backgroundColor: colors.brand.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  newBtnText: {
    color: colors.text.inverse,
    fontSize: typography.size.xl,
    fontWeight: typography.weight.bold as '700',
    lineHeight: 36,
  },
  list: { paddingHorizontal: spacing.md },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    gap: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.default,
  },
  avatar: {
    width: 46,
    height: 46,
    borderRadius: radius.full,
    backgroundColor: colors.brand.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: colors.text.inverse,
    fontWeight: typography.weight.bold as '700',
    fontSize: typography.size.sm,
  },
  rowBody: { flex: 1, gap: 2 },
  participantText: {
    fontSize: typography.size.base,
    fontWeight: typography.weight.semibold as '600',
    color: colors.text.primary,
  },
  preview: { fontSize: typography.size.sm, color: colors.text.secondary },
  rowMeta: { alignItems: 'flex-end', gap: spacing.xs },
  time: { fontSize: typography.size.xs, color: colors.text.tertiary },
  badge: {
    backgroundColor: colors.brand.primary,
    borderRadius: radius.full,
    minWidth: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
  },
  badgeText: {
    color: colors.text.inverse,
    fontSize: typography.size.xs,
    fontWeight: typography.weight.bold as '700',
  },
  emptyContainer: {
    paddingTop: spacing['3xl'],
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.xl,
  },
  emptyTitle: {
    fontSize: typography.size.lg,
    fontWeight: typography.weight.semibold as '600',
    color: colors.text.primary,
    textAlign: 'center',
  },
  emptyBody: {
    fontSize: typography.size.base,
    color: colors.text.tertiary,
    textAlign: 'center',
    lineHeight: 24,
  },
});
