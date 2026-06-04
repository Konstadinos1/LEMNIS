import { useEffect } from 'react';
import { useChatStore } from '@/store/chat';
import { ratchetDecrypt, ratchetInitBob, deserializeState, serializeState } from '@/lib/crypto/doubleRatchet';
import { senderKeyDecrypt, deserializeSenderKey, serializeSenderKey } from '@/lib/crypto/senderKey';
import { x3dhRespond, type X3DHInitMessage } from '@/lib/crypto/x3dh';
import { loadIdentity } from '@/lib/crypto/identity';
import { createRelayJwt } from '@/lib/api/relayAuth';
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
  wsRef: React.MutableRefObject<WebSocket | null>,
) {
  const appendMessage   = useChatStore((s) => s.appendMessage);
  const touchLastMessage = useChatStore((s) => s.touchLastMessage);

  useEffect(() => {
    if (!threadId) return;

    let cancelled = false;

    void (async () => {
      // Create the EdDSA JWT before opening the socket — relay rejects connections
      // without a valid signed token (UserSocket.connect + ThreadChannel.join).
      let relayJwt: string;
      try {
        relayJwt = await createRelayJwt();
      } catch {
        return; // identity not available yet — caller should retry after onboarding
      }

      if (cancelled) return;

      const url = `${WS_BASE}/socket/websocket?token=${encodeURIComponent(relayJwt)}`;
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        ws.send(JSON.stringify({
          topic:   `thread:${threadId}`,
          event:   'phx_join',
          payload: { token: relayJwt },
          ref:     '1',
        }));
      };

    ws.onmessage = (evt) => {
      // Decryption is async — run in a void async IIFE so the handler can await
      void (async () => {
        try {
          const frame = JSON.parse(evt.data as string) as {
            event:   string;
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
            const { state: nextSK, plaintext: pt } = await senderKeyDecrypt(skState, msg);
            storage.set(`senderkey:${groupId}`, serializeSenderKey(nextSK));
            plaintext = new TextDecoder().decode(pt);
          } else {
            // Double Ratchet (1:1)
            const peerId = session_id.slice(3); // dr:<threadId>
            const msg = JSON.parse(envelope);

            // Reconstruct typed arrays from JSON-serialised number arrays
            const typedMsg = {
              header: {
                dh: new Uint8Array(msg.header.dh),
                pn: msg.header.pn,
                n:  msg.header.n,
              },
              ciphertext: {
                iv:         new Uint8Array(msg.ciphertext.iv),
                tag:        new Uint8Array(msg.ciphertext.tag),
                ciphertext: new Uint8Array(msg.ciphertext.ciphertext),
              },
            };

            let stateRaw = storage.getString(`ratchet:${peerId}`);

            if (msg.type === 'x3dh_init' && !stateRaw) {
              // First message from Alice — establish the X3DH session (Bob side)
              const myIdentity = await loadIdentity();
              if (!myIdentity) return;

              const initMsg: X3DHInitMessage = {
                identityKeyDh:   new Uint8Array(msg.init.identityKeyDh),
                ephemeralKey:    new Uint8Array(msg.init.ephemeralKey),
                signedPreKeyId:  msg.init.signedPreKeyId,
                oneTimePreKeyId: msg.init.oneTimePreKeyId ?? undefined,
              };

              const sharedSecret = await x3dhRespond(myIdentity, initMsg);
              const bobRatchet = ratchetInitBob(sharedSecret, myIdentity.signedPreKey.keyPair);
              stateRaw = serializeState(bobRatchet);
              storage.set(`ratchet:${peerId}`, stateRaw);
            }

            if (!stateRaw) return;

            const ad = new TextEncoder().encode(threadId);
            const { state: nextRatchet, plaintext: pt } = await ratchetDecrypt(
              deserializeState(stateRaw),
              typedMsg,
              ad,
            );
            storage.set(`ratchet:${peerId}`, serializeState(nextRatchet));
            plaintext = new TextDecoder().decode(pt);
          }

          const message = JSON.parse(plaintext) as Message;
          appendMessage(threadId, message);
          touchLastMessage(threadId, message);
        } catch {
          // Decryption failures are silently dropped — never leak partial state
        }
      })();
    };

      ws.onerror = () => {
        // Reconnect handled by caller via retry logic in production
      };
    })();

    return () => {
      cancelled = true;
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [threadId, appendMessage, touchLastMessage, wsRef]);
}
