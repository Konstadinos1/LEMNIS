import React, { useCallback } from 'react';
import { StyleSheet } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { MessageBubble } from './MessageBubble';
import type { Message, MessageType } from '@/types/message';

interface Props {
  messages: Message[];
  myId: string;
}

/**
 * Virtualized, inverted message list backed by FlashList v2.
 * Multiple recycling pools keep view recycling cheap across message types.
 */
export function MessageList({ messages, myId }: Props) {
  const renderItem = useCallback(
    ({ item }: { item: Message }) => (
      <MessageBubble message={item} isMine={item.senderId === myId} />
    ),
    [myId]
  );

  const keyExtractor = useCallback((item: Message) => item.id, []);

  const getItemType = useCallback((item: Message): MessageType => item.type, []);

  return (
    <FlashList
      data={messages}
      renderItem={renderItem}
      keyExtractor={keyExtractor}
      getItemType={getItemType}
      inverted
      estimatedItemSize={60}
      maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
      contentContainerStyle={styles.content}
    />
  );
}

const styles = StyleSheet.create({
  content: {
    paddingVertical: 8,
  },
});
