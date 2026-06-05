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
const MAX_BACKOFF_MS = 30_000;

function backoffDelay(attempt: number): number {
  const base = Math.min(1_000 * 2 ** attempt, MAX_BACKOFF_MS);
  return base * (0.8 + Math.random() * 0.4); // ±20% jitter
}

/**
 * Maintain a Phoenix Channel WebSocket connection for a thread.
 * Reconnects with exponential backoff on close/error.
 * Incoming envelopes are decrypted client-side — relay only ever sees ciphertext.
 */
export function useThreadMessages(
  threadId: string,
  wsRef: React.MutableRefObject<WebSocket | null>,
) {
  const appendMessage    = useChatStore((s) => s.appendMessage);
  const touchLastMessage = useChatStore((s) => s.touchLastMessage);

  useEffect(() => {
    if (!threadId) return;

    let cancelled = false;
    let attempt = 0;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    function scheduleReconnect() {
      if (cancelled) return;
      reconnectTimer = setTimeout(() => { void connect(); }, backoffDelay(attempt++));
    }

    async function connect() {
      if (cancelled) return;

      let relayJwt: string;
      try {
        relayJwt = await createRelayJwt();
      } catch {
        // Identity not available yet — wait and retry
        scheduleReconnect();
        return;
      }

      if (cancelled) return;

      const url = `${WS_BASE}/socket/websocket?token=${encodeURIComponent(relayJwt)}`;
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        attempt = 0; // reset backoff on successful connection
        ws.send(JSON.stringify({
          topic:   `thread:${threadId}`,
          event:   'phx_join',
          payload: { token: relayJwt },
          ref:     '1',
        }));
      };

      ws.onmessage = (evt) => {
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
        // onclose fires immediately after onerror — reconnect is scheduled there
      };

      ws.onclose = () => {
        wsRef.current = null;
        scheduleReconnect();
      };
    }

    void connect();

    return () => {
      cancelled = true;
      if (reconnectTimer !== null) clearTimeout(reconnectTimer);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [threadId, appendMessage, touchLastMessage, wsRef]);
}
