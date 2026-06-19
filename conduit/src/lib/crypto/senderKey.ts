/**
 * Sender Key protocol for group messaging.
 * Each group member has a Sender Key — a symmetric ratchet chain.
 * Messages are encrypted once under the sender's key and broadcast.
 * Membership changes trigger a sender-key rotation.
 *
 * All operations are async — they route through the Rust native module
 * (conduit-crypto) when available, with a JS fallback.
 */

import {
  hkdfAsync,
  hmacSha256Async,
  aesGcmEncryptAsync,
  aesGcmDecryptAsync,
  secureRandomAsync,
  toBase64,
  fromBase64,
  type AesGcmCiphertext,
} from './primitives';

const INFO_SK_ENCRYPT = 'SenderKeyEncrypt';

export interface SenderKeyState {
  chainKey:  Uint8Array;  // 32 bytes — ratchets on each message
  iteration: number;
  senderId:  string;
}

export interface SenderKeyMessage {
  senderId:   string;
  iteration:  number;
  ciphertext: AesGcmCiphertext;
}

async function ratchetSenderKey(ck: Uint8Array): Promise<[Uint8Array, Uint8Array]> {
  const [mk, ckNext] = await Promise.all([
    hmacSha256Async(ck, new Uint8Array([0x01])),
    hmacSha256Async(ck, new Uint8Array([0x02])),
  ]);
  return [ckNext, mk];
}

export async function createSenderKeyState(senderId: string): Promise<SenderKeyState> {
  const chainKey = await secureRandomAsync(32);
  return { chainKey, iteration: 0, senderId };
}

export async function senderKeyEncrypt(
  state: SenderKeyState,
  plaintext: Uint8Array,
): Promise<{ state: SenderKeyState; message: SenderKeyMessage }> {
  const [chainKey, mk] = await ratchetSenderKey(state.chainKey);
  const encKey = await hkdfAsync(mk, 32, new Uint8Array(32), INFO_SK_ENCRYPT);
  const ad = new TextEncoder().encode(`${state.senderId}:${state.iteration}`);
  const ciphertext = await aesGcmEncryptAsync(encKey, plaintext, ad);

  return {
    state:   { ...state, chainKey, iteration: state.iteration + 1 },
    message: { senderId: state.senderId, iteration: state.iteration, ciphertext },
  };
}

export async function senderKeyDecrypt(
  state: SenderKeyState,
  message: SenderKeyMessage,
): Promise<{ state: SenderKeyState; plaintext: Uint8Array }> {
  if (message.senderId !== state.senderId) throw new Error('Sender ID mismatch');

  // Fast-forward ratchet for skipped messages
  let s = state;
  while (s.iteration < message.iteration) {
    const [ck] = await ratchetSenderKey(s.chainKey);
    s = { ...s, chainKey: ck, iteration: s.iteration + 1 };
  }

  const [chainKey, mk] = await ratchetSenderKey(s.chainKey);
  const encKey = await hkdfAsync(mk, 32, new Uint8Array(32), INFO_SK_ENCRYPT);
  const ad = new TextEncoder().encode(`${message.senderId}:${message.iteration}`);
  const plaintext = await aesGcmDecryptAsync(encKey, message.ciphertext, ad);

  return {
    state:    { ...s, chainKey, iteration: s.iteration + 1 },
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
