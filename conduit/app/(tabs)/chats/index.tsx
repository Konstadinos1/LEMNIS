import React from 'react';
import { View, Text, FlatList, Pressable, StyleSheet, SafeAreaView } from 'react-native';
import { router } from 'expo-router';
import { useChatStore } from '@/store/chat';
import { colors, spacing, typography, radius } from '@/theme/tokens';
import type { Thread } from '@/types/message';

export default function ChatsScreen() {
  const threads = useChatStore((s) => Object.values(s.threads));

  function openThread(threadId: string) {
    router.push(`/(tabs)/chats/${threadId}`);
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Text style={styles.title}>Messages</Text>
      </View>
      <FlatList
        data={threads}
        keyExtractor={(t) => t.id}
        renderItem={({ item }) => <ThreadRow thread={item} onPress={openThread} />}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <Text style={styles.empty}>No conversations yet.{'\n'}Start one.</Text>
        }
      />
    </SafeAreaView>
  );
}

function ThreadRow({
  thread,
  onPress,
}: {
  thread: Thread;
  onPress: (id: string) => void;
}) {
  return (
    <Pressable style={styles.row} onPress={() => onPress(thread.id)}>
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>
          {thread.id.slice(0, 2).toUpperCase()}
        </Text>
      </View>
      <View style={styles.rowBody}>
        <Text style={styles.participantText} numberOfLines={1}>
          {thread.participants.join(', ')}
        </Text>
        {thread.lastMessage?.type === 'text' && (
          <Text style={styles.preview} numberOfLines={1}>
            {thread.lastMessage.plaintext}
          </Text>
        )}
      </View>
      {thread.unreadCount > 0 && (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{thread.unreadCount}</Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg.base },
  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  title: {
    fontSize: typography.size['2xl'],
    fontWeight: typography.weight.bold as '700',
    color: colors.text.primary,
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
  preview: {
    fontSize: typography.size.sm,
    color: colors.text.secondary,
  },
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
  empty: {
    textAlign: 'center',
    color: colors.text.tertiary,
    fontSize: typography.size.base,
    marginTop: spacing['3xl'],
    lineHeight: 26,
  },
});
