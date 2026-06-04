import { useCallback } from 'react';
import { useChatStore } from '@/store/chat';
import { useWalletStore } from '@/store/wallet';
import { ratchetEncrypt, serializeState, deserializeState } from '@/lib/crypto/doubleRatchet';
import { senderKeyEncrypt, serializeSenderKey, deserializeSenderKey } from '@/lib/crypto/senderKey';
import { MMKV } from 'react-native-mmkv';
import type { Message } from '@/types/message';

const storage = new MMKV();
const WS_BASE = process.env.EXPO_PUBLIC_WS_BASE_URL ?? 'wss://relay.conduit.app';

export function useSendMessage(
  threadId: string,
  wsRef: React.MutableRefObject<WebSocket | null>,
  recipientFingerprints?: string[],
) {
  const appendMessage = useChatStore((s) => s.appendMessage);
  const myId = useWalletStore((s) => s.account?.address ?? '');

  return useCallback(
    async (text: string) => {
      if (!text.trim() || !myId) return;

      const plainMsg: Message = {
        id:        crypto.randomUUID(),
        threadId,
        senderId:  myId,
        timestamp: Date.now(),
        type:      'text',
        ciphertext: '',
        plaintext:  text.trim(),
      };

      // Optimistic UI — replaced by decrypted echo on relay round-trip
      appendMessage(threadId, plainMsg);

      const plaintextBytes = new TextEncoder().encode(JSON.stringify(plainMsg));
      const ad = new TextEncoder().encode(threadId);

      let envelope: string;
      let sessionId: string;

      const skRaw = storage.getString(`senderkey:${threadId}`);
      if (skRaw) {
        // Group path: Sender Keys
        const skState = deserializeSenderKey(skRaw);
        const { state: nextSK, message } = await senderKeyEncrypt(skState, plaintextBytes);
        storage.set(`senderkey:${threadId}`, serializeSenderKey(nextSK));
        envelope = JSON.stringify(message);
        sessionId = `sk:${threadId}`;
      } else {
        // 1:1 path: Double Ratchet
        const ratchetRaw = storage.getString(`ratchet:${threadId}`);
        if (!ratchetRaw) return; // session not yet established — need X3DH first

        const ratchet = deserializeState(ratchetRaw);
        const { state: nextRatchet, message } = await ratchetEncrypt(ratchet, plaintextBytes, ad);
        storage.set(`ratchet:${threadId}`, serializeState(nextRatchet));

        const msgBody = {
          header: {
            dh: Array.from(message.header.dh),
            pn: message.header.pn,
            n:  message.header.n,
          },
          ciphertext: {
            iv:         Array.from(message.ciphertext.iv),
            tag:        Array.from(message.ciphertext.tag),
            ciphertext: Array.from(message.ciphertext.ciphertext),
          },
        };

        // On the first message in a 1:1 thread, piggyback the X3DH init so
        // the recipient can establish their ratchet session.
        const x3dhInitRaw = storage.getString(`x3dhInit:${threadId}`);
        if (x3dhInitRaw) {
          storage.delete(`x3dhInit:${threadId}`);
          envelope = JSON.stringify({ type: 'x3dh_init', init: JSON.parse(x3dhInitRaw), ...msgBody });
        } else {
          envelope = JSON.stringify(msgBody);
        }

        sessionId = `dr:${threadId}`;
      }

      // Relay only ever sees ciphertext
      const payload: Record<string, unknown> = { envelope, session_id: sessionId };
      if (recipientFingerprints && recipientFingerprints.length > 0) {
        payload.to = recipientFingerprints;
      }
      wsRef.current?.send(JSON.stringify({
        topic:   `thread:${threadId}`,
        event:   'send_message',
        payload,
        ref:     crypto.randomUUID(),
      }));
    },
    [threadId, myId, appendMessage, wsRef, recipientFingerprints],
  );
}
