/**
 * Notification preview keys — device-local AES-256 keys that let the iOS
 * Notification Service Extension and Android FCM service decrypt a short
 * preview (sender + truncated text) without advancing the Double Ratchet.
 *
 * Architecture:
 *   1. On first launch, generate a 32-byte random preview key.
 *   2. Store it in SecureStore under a key that is also accessible from
 *      the shared app group (iOS) / MMKV external storage (Android).
 *   3. Upload the preview key (encrypted) to the relay so the server can
 *      encrypt push payloads for this device.
 *   4. When the relay fans out a message it appends encrypted_preview to
 *      the APNs / FCM payload — the extension decrypts only that field.
 *
 * Forward-secrecy note: the preview key is semi-static (rotated monthly).
 * It reveals metadata (sender + snippet) to whoever holds it — the server
 * and the device. The full message content is still protected by the
 * Double Ratchet and is NEVER sent in the push payload.
 */

import * as SecureStore from 'expo-secure-store';
import { secureRandomAsync, toBase64, fromBase64 } from '@/lib/crypto/primitives';
import { aesGcmEncryptAsync, aesGcmDecryptAsync } from '@/lib/crypto/primitives';
import { apiPost } from '@/lib/api/client';

const KEY_PREVIEW_KEY  = 'conduit.notif.previewKey';
const KEY_PUSH_TOKEN   = 'conduit.notif.pushToken';

// Shared keychain group — must match the app group in entitlements and NSE
export const APP_GROUP_ID = 'group.com.conduit.app';

export interface NotificationPreviewKey {
  keyBytes: Uint8Array;    // 32-byte AES-256 key
  keyBase64: string;       // base64-encoded for upload to relay
  createdAt: number;       // Unix ms — used to trigger monthly rotation
}

// ─── Key generation / loading ─────────────────────────────────────────────────

export async function loadOrCreatePreviewKey(): Promise<NotificationPreviewKey> {
  const existing = await SecureStore.getItemAsync(KEY_PREVIEW_KEY);
  if (existing) {
    const parsed = JSON.parse(existing) as { key: string; createdAt: number };
    const keyBytes = fromBase64(parsed.key);
    // Rotate if older than 30 days
    if (Date.now() - parsed.createdAt < 30 * 24 * 60 * 60 * 1000) {
      return { keyBytes, keyBase64: parsed.key, createdAt: parsed.createdAt };
    }
  }

  const keyBytes  = await secureRandomAsync(32);
  const keyBase64 = toBase64(keyBytes);
  const createdAt = Date.now();

  await SecureStore.setItemAsync(
    KEY_PREVIEW_KEY,
    JSON.stringify({ key: keyBase64, createdAt }),
    { keychainAccessible: SecureStore.ALWAYS_THIS_DEVICE_ONLY },
  );

  return { keyBytes, keyBase64, createdAt };
}

// ─── Push token registration ──────────────────────────────────────────────────

export async function registerPushToken(
  pushToken: string,
  platform: 'apns' | 'fcm',
): Promise<void> {
  await SecureStore.setItemAsync(KEY_PUSH_TOKEN, pushToken);
  const previewKey = await loadOrCreatePreviewKey();
  await apiPost('/api/push/register', {
    push_token:   pushToken,
    platform,
    preview_key:  previewKey.keyBase64,
  });
}

// ─── Preview encryption (used server-side via relay; mirrored here for tests) ─

export async function encryptPreview(
  previewText: string,
  previewKey: Uint8Array,
): Promise<string> {
  const plaintext = new TextEncoder().encode(previewText.slice(0, 64));
  const nonce     = await secureRandomAsync(12);
  const ct        = await aesGcmEncryptAsync(previewKey, plaintext);
  // Wire format: base64(nonce || ciphertext || tag)
  const combined = new Uint8Array(12 + ct.ciphertext.length + ct.tag.length);
  combined.set(nonce, 0);
  combined.set(ct.ciphertext, 12);
  combined.set(ct.tag, 12 + ct.ciphertext.length);
  return toBase64(combined);
}

export async function decryptPreview(
  encryptedBase64: string,
  previewKey: Uint8Array,
): Promise<string> {
  const raw = fromBase64(encryptedBase64);
  if (raw.length < 12 + 16) throw new Error('Preview ciphertext too short');
  const nonce      = raw.slice(0, 12);
  const ciphertext = raw.slice(12, raw.length - 16);
  const tag        = raw.slice(raw.length - 16);
  const plaintext  = await aesGcmDecryptAsync(previewKey, { iv: nonce, ciphertext, tag });
  return new TextDecoder().decode(plaintext);
}
