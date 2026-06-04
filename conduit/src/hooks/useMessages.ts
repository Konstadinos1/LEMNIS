import { useEffect } from 'react';
import { useChatStore } from '@/store/chat';
import { ratchetDecrypt, deserializeState, serializeState } from '@/lib/crypto/doubleRatchet';
import { senderKeyDecrypt, deserializeSenderKey, serializeSenderKey } from '@/lib/crypto/senderKey';
import { MMKV } from 'react-native-mmkv';
import type { Message } from '@/types/message';

const storage = new MMKV();
const WS_BASE = process.env.EXPO_PUBLIC_WS_BASE_URL ?? 'wss://relay.conduit.app';

/**
 * Maintain a Phoenix Channel WebSocket connection for a thread.
 * Incoming envelopes are decrypted client-side before being stored.
 * The relay only ever sees ciphertext.
 */
export function useThreadMessages(
  threadId: string,
  wsRef: React.MutableRefObject<WebSocket | null>
) {
  const appendMessage = useChatStore((s) => s.appendMessage);
  const upsertThread = useChatStore((s) => s.upsertThread);

  useEffect(() => {
    if (!threadId) return;

    const ws = new WebSocket(`${WS_BASE}/socket/websocket`);
    wsRef.current = ws;

    ws.onopen = () => {
      ws.send(JSON.stringify({
        topic: `thread:${threadId}`,
        event: 'phx_join',
        payload: {},
        ref: '1',
      }));
    };

    ws.onmessage = (evt) => {
      try {
        const frame = JSON.parse(evt.data as string) as {
          event: string;
          payload: { envelope: string; session_id: string };
        };
        if (frame.event !== 'new_message') return;

        const { envelope, session_id } = frame.payload;
        let plaintext: string;

        if (session_id.startsWith('sk:')) {
          // Sender Key (group)
          const groupId = session_id.slice(3);
          const skRaw = storage.getString(`senderkey:${groupId}`);
          if (!skRaw) return;
          const skState = deserializeSenderKey(skRaw);
          const msg = JSON.parse(envelope);
          const { state: nextSK, plaintext: pt } = senderKeyDecrypt(skState, msg);
          storage.set(`senderkey:${groupId}`, serializeSenderKey(nextSK));
          plaintext = new TextDecoder().decode(pt);
        } else {
          // Double Ratchet (1:1)
          const peerId = session_id.slice(3); // dr:<threadId>
          const stateRaw = storage.getString(`ratchet:${peerId}`);
          if (!stateRaw) return;
          const ratchet = deserializeState(stateRaw);
          const msg = JSON.parse(envelope);
          const ad = new TextEncoder().encode(threadId);
          const { state: nextRatchet, plaintext: pt } = ratchetDecrypt(ratchet, msg, ad);
          storage.set(`ratchet:${peerId}`, serializeState(nextRatchet));
          plaintext = new TextDecoder().decode(pt);
        }

        const message = JSON.parse(plaintext) as Message;
        appendMessage(threadId, message);

        // Keep thread list in sync
        upsertThread({
          id: threadId,
          participants: [],
          lastMessage: message,
          unreadCount: 1,
        });
      } catch {
        // Decryption failures are silently dropped — never leak partial state
      }
    };

    ws.onerror = () => {
      // Reconnect is handled by the caller via retry logic in production
    };

    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, [threadId, appendMessage, upsertThread, wsRef]);
}
