import { useEffect, useRef } from 'react';
import { useChatStore } from '@/store/chat';
import { decryptMessage } from '@/crypto/messaging';
import type { Message, BaseMessage } from '@/types/message';

const WS_BASE = process.env.EXPO_PUBLIC_WS_BASE_URL ?? 'wss://relay.conduit.app';

/**
 * Maintain a WebSocket connection to the Phoenix relay for a given thread.
 * Incoming envelopes are decrypted client-side using the Double Ratchet session
 * before being stored; the relay only ever sees ciphertext.
 */
export function useThreadMessages(threadId: string) {
  const appendMessage = useChatStore((s) => s.appendMessage);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!threadId) return;

    const ws = new WebSocket(`${WS_BASE}/socket/websocket`);
    wsRef.current = ws;

    ws.onopen = () => {
      // Phoenix channel join
      ws.send(
        JSON.stringify({
          topic: `thread:${threadId}`,
          event: 'phx_join',
          payload: {},
          ref: '1',
        })
      );
    };

    ws.onmessage = async (evt) => {
      try {
        const frame = JSON.parse(evt.data as string) as {
          event: string;
          payload: { envelope: string; sessionId: string };
        };

        if (frame.event !== 'new_message') return;

        // Decrypt on native Rust thread via JSI — never blocks the JS thread
        const plaintext = await decryptGroupMessage(
          frame.payload.sessionId,
          frame.payload.envelope
        );

        const msg: Message = JSON.parse(plaintext) as Message;
        appendMessage(threadId, msg);
      } catch {
        // Decryption failures are silently dropped to avoid leaking state
      }
    };

    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, [threadId, appendMessage]);
}

// Re-export for convenience
import { decryptGroupMessage } from '@/crypto/messaging';
