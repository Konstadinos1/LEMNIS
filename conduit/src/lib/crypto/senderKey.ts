/**
 * Sender Key protocol for group messaging.
 * Each group member has a Sender Key — a symmetric ratchet chain.
 * Messages are encrypted once under the sender's key and broadcast.
 * Membership changes trigger a sender-key rotation.
 */

import {
  hkdf,
  hmacSha256,
  aesGcmEncrypt,
  aesGcmDecrypt,
  secureRandom,
  toBase64,
  fromBase64,
  type AesGcmCiphertext,
} from './primitives';

const INFO_SK = 'SenderKeyRatchet';

export interface SenderKeyState {
  chainKey: Uint8Array;  // 32 bytes — ratchets on each message
  iteration: number;
  senderId: string;
}

export interface SenderKeyMessage {
  senderId: string;
  iteration: number;
  ciphertext: AesGcmCiphertext;
}

function ratchetSenderKey(ck: Uint8Array): [Uint8Array, Uint8Array] {
  const mk = hmacSha256(ck, new Uint8Array([0x01]));
  const ckNext = hmacSha256(ck, new Uint8Array([0x02]));
  return [ckNext, mk];
}

export function createSenderKeyState(senderId: string): SenderKeyState {
  return {
    chainKey: secureRandom(32),
    iteration: 0,
    senderId,
  };
}

export function senderKeyEncrypt(
  state: SenderKeyState,
  plaintext: Uint8Array
): { state: SenderKeyState; message: SenderKeyMessage } {
  const [chainKey, mk] = ratchetSenderKey(state.chainKey);
  const encKey = hkdf(mk, 32, new Uint8Array(32), 'SenderKeyEncrypt');
  const ad = new TextEncoder().encode(`${state.senderId}:${state.iteration}`);
  const ciphertext = aesGcmEncrypt(encKey, plaintext, ad);

  return {
    state: { ...state, chainKey, iteration: state.iteration + 1 },
    message: { senderId: state.senderId, iteration: state.iteration, ciphertext },
  };
}

export function senderKeyDecrypt(
  state: SenderKeyState,
  message: SenderKeyMessage
): { state: SenderKeyState; plaintext: Uint8Array } {
  if (message.senderId !== state.senderId) throw new Error('Sender ID mismatch');

  // Fast-forward ratchet if iterations were skipped
  let s = state;
  while (s.iteration < message.iteration) {
    const [ck] = ratchetSenderKey(s.chainKey);
    s = { ...s, chainKey: ck, iteration: s.iteration + 1 };
  }

  const [chainKey, mk] = ratchetSenderKey(s.chainKey);
  const encKey = hkdf(mk, 32, new Uint8Array(32), 'SenderKeyEncrypt');
  const ad = new TextEncoder().encode(`${message.senderId}:${message.iteration}`);
  const plaintext = aesGcmDecrypt(encKey, message.ciphertext, ad);

  return {
    state: { ...s, chainKey, iteration: s.iteration + 1 },
    plaintext,
  };
}

export function serializeSenderKey(s: SenderKeyState): string {
  return JSON.stringify({ ck: toBase64(s.chainKey), i: s.iteration, id: s.senderId });
}

export function deserializeSenderKey(raw: string): SenderKeyState {
  const d = JSON.parse(raw);
  return { chainKey: fromBase64(d.ck), iteration: d.i, senderId: d.id };
}
