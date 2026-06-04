import { useCallback, useRef } from 'react';
import { useChatStore } from '@/store/chat';
import { useWalletStore } from '@/store/wallet';
import { ratchetEncrypt, serializeState, deserializeState } from '@/lib/crypto/doubleRatchet';
import { senderKeyEncrypt, serializeSenderKey, deserializeSenderKey } from '@/lib/crypto/senderKey';
import { MMKV } from 'react-native-mmkv';
import type { Message } from '@/types/message';

const storage = new MMKV();
const WS_BASE = process.env.EXPO_PUBLIC_WS_BASE_URL ?? 'wss://relay.conduit.app';

function getRatchetState(peerId: string) {
  const raw = storage.getString(`ratchet:${peerId}`);
  return raw ? deserializeState(raw) : null;
}

function saveRatchetState(peerId: string, state: ReturnType<typeof deserializeState>) {
  storage.set(`ratchet:${peerId}`, serializeState(state));
}

function getSenderKeyState(groupId: string) {
  const raw = storage.getString(`senderkey:${groupId}`);
  return raw ? deserializeSenderKey(raw) : null;
}

function saveSenderKeyState(groupId: string, state: ReturnType<typeof deserializeSenderKey>) {
  storage.set(`senderkey:${groupId}`, serializeSenderKey(state));
}

export function useSendMessage(threadId: string, wsRef: React.MutableRefObject<WebSocket | null>) {
  const appendMessage = useChatStore((s) => s.appendMessage);
  const myId = useWalletStore((s) => s.account?.address ?? '');

  return useCallback(
    async (text: string) => {
      if (!text.trim() || !myId) return;

      const plainMsg: Message = {
        id: crypto.randomUUID(),
        threadId,
        senderId: myId,
        timestamp: Date.now(),
        type: 'text',
        ciphertext: '',
        plaintext: text.trim(),
      };

      // Optimistically append to UI (will be replaced with decrypted version on round-trip)
      appendMessage(threadId, plainMsg);

      const plaintextBytes = new TextEncoder().encode(JSON.stringify(plainMsg));
      const ad = new TextEncoder().encode(threadId);

      let envelope: string;
      let sessionId: string;

      const skState = getSenderKeyState(threadId);
      if (skState) {
        // Group path: Sender Keys
        const { state: nextSK, message } = senderKeyEncrypt(skState, plaintextBytes);
        saveSenderKeyState(threadId, nextSK);
        envelope = JSON.stringify(message);
        sessionId = `sk:${threadId}`;
      } else {
        // 1:1 path: Double Ratchet
        const ratchet = getRatchetState(threadId);
        if (!ratchet) return; // session not yet established (need X3DH first)

        const { state: nextRatchet, message } = ratchetEncrypt(ratchet, plaintextBytes, ad);
        saveRatchetState(threadId, nextRatchet);
        envelope = JSON.stringify({
          header: {
            dh: Array.from(message.header.dh),
            pn: message.header.pn,
            n: message.header.n,
          },
          ciphertext: {
            iv: Array.from(message.ciphertext.iv),
            tag: Array.from(message.ciphertext.tag),
            ciphertext: Array.from(message.ciphertext.ciphertext),
          },
        });
        sessionId = `dr:${threadId}`;
      }

      // Send ciphertext to relay — relay never sees plaintext
      wsRef.current?.send(
        JSON.stringify({
          topic: `thread:${threadId}`,
          event: 'send_message',
          payload: { envelope, session_id: sessionId },
          ref: crypto.randomUUID(),
        })
      );
    },
    [threadId, myId, appendMessage, wsRef]
  );
}
