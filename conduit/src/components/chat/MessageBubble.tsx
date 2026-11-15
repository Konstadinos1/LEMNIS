import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { SwapReceiptCard } from './SwapReceiptCard';
import { TransactionPill } from './TransactionPill';
import { colors, radius, spacing, typography } from '@/theme/tokens';
import type { Message } from '@/types/message';

interface Props {
  message: Message;
  isMine: boolean;
}

export function MessageBubble({ message, isMine }: Props) {
  const align = isMine ? styles.alignRight : styles.alignLeft;

  if (message.type === 'swap_receipt') {
    return (
      <View style={[styles.wrapper, align]}>
        <SwapReceiptCard receipt={message.receipt} />
      </View>
    );
  }

  if (message.type === 'tx_pill') {
    return (
      <View style={[styles.wrapper, align]}>
        <TransactionPill
          txHash={message.txHash}
          status={message.status}
          chainId={message.chainId}
        />
      </View>
    );
  }

  if (message.type === 'text') {
    return (
      <View style={[styles.wrapper, align]}>
        <View style={[styles.bubble, isMine ? styles.bubbleMine : styles.bubbleOther]}>
          <Text style={[styles.text, isMine ? styles.textMine : styles.textOther]}>
            {message.plaintext}
          </Text>
        </View>
        <Text style={[styles.timestamp, isMine ? styles.alignRight : styles.alignLeft]}>
          {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </Text>
      </View>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  wrapper: {
    marginVertical: 2,
    marginHorizontal: spacing.md,
    maxWidth: '75%',
  },
  alignLeft: { alignSelf: 'flex-start' },
  alignRight: { alignSelf: 'flex-end' },
  bubble: {
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  bubbleMine: {
    backgroundColor: colors.brand.primary,
    borderBottomRightRadius: radius.sm,
  },
  bubbleOther: {
    backgroundColor: colors.bg.elevated,
    borderBottomLeftRadius: radius.sm,
  },
  text: {
    fontSize: typography.size.base,
    lineHeight: 22,
  },
  textMine: { color: colors.text.inverse },
  textOther: { color: colors.text.primary },
  timestamp: {
    fontSize: typography.size.xs,
    color: colors.text.tertiary,
    marginTop: 2,
  },
});
