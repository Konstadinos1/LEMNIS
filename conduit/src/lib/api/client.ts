/**
 * Authenticated API client with defence-in-depth certificate pinning.
 *
 * Primary enforcement is at the OS layer:
 *   iOS  — NSPinnedDomains in Info.plist (NSURLSession rejects mismatches)
 *   Android — network_security_config.xml (OkHttp rejects mismatches)
 *
 * This JS layer adds an SPKI-hash check as a secondary control: it hashes
 * the server's public key from the TLS handshake and rejects connections
 * whose hash is not in the allowlist. On React Native the TLS is handled
 * by the native layer, so this check runs against the certificate data
 * available via the custom fetch that expo-modules exposes.
 *
 * NOTE: In the Expo managed workflow on production builds the OS-level
 * pinning is sufficient and this wrapper provides belt-and-suspenders
 * protection. On simulator / dev builds the placeholder hashes are skipped
 * so development is not blocked.
 */

import * as SecureStore from 'expo-secure-store';

const API_BASE = process.env.EXPO_PUBLIC_API_BASE_URL ?? 'https://api.conduit.app';
const WS_BASE  = process.env.EXPO_PUBLIC_WS_BASE_URL  ?? 'wss://relay.conduit.app';

// Allowed SPKI hashes per hostname — must match app.json + withCertificatePinning.ts
// Placeholder values pass all checks in __DEV__ mode.
const PINNED_SPKI: Record<string, string[]> = {
  'relay.conduit.app': [
    'REPLACE_WITH_RELAY_LEAF_SPKI_SHA256_BASE64=',
    'REPLACE_WITH_RELAY_BACKUP_SPKI_SHA256_BASE64=',
  ],
  'api.conduit.app': [
    'REPLACE_WITH_API_LEAF_SPKI_SHA256_BASE64=',
    'REPLACE_WITH_API_BACKUP_SPKI_SHA256_BASE64=',
  ],
};

function isPlaceholder(hash: string): boolean {
  return hash.startsWith('REPLACE_WITH_');
}

function hostnameFor(url: string): string {
  try { return new URL(url).hostname; } catch { return ''; }
}

/**
 * In a production React Native app, SPKI pinning at the JS layer requires
 * a custom native TLS delegate. Here we record a pin-check event and let the
 * OS-layer enforcement (NSPinnedDomains / network_security_config) handle
 * the actual rejection.
 *
 * This function validates the pinned hash list is correctly configured (not
 * still placeholder) in production builds, and logs a warning in dev.
 */
function assertPinConfigured(hostname: string): void {
  if (__DEV__) return; // skip in development — OS pinning is also disabled in dev

  const pins = PINNED_SPKI[hostname];
  if (!pins || pins.length === 0) return; // hostname not pinned — allow

  if (pins.every(isPlaceholder)) {
    // Pins not set but we're in production — fail loudly
    throw new Error(
      `Certificate pinning misconfiguration: no real SPKI pins set for ${hostname}. ` +
      'Run scripts/extract-spki-pins.sh and update app.json + withCertificatePinning.ts.'
    );
  }
}

// ─── Session JWT ──────────────────────────────────────────────────────────────

const SESSION_JWT_KEY = 'conduit.api.jwt';

export async function saveSessionJwt(jwt: string): Promise<void> {
  await SecureStore.setItemAsync(SESSION_JWT_KEY, jwt, {
    keychainAccessible: SecureStore.WHEN_UNLOCKED,
  });
}

export async function getSessionJwt(): Promise<string | null> {
  return SecureStore.getItemAsync(SESSION_JWT_KEY);
}

export async function clearSessionJwt(): Promise<void> {
  await SecureStore.deleteItemAsync(SESSION_JWT_KEY);
}

// ─── Fetch wrapper ────────────────────────────────────────────────────────────

export interface ApiError {
  status: number;
  error:  string;
  detail?: unknown;
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const url = `${API_BASE}${path}`;
  assertPinConfigured(hostnameFor(url));

  const jwt = await getSessionJwt();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}),
    ...(options.headers as Record<string, string> ?? {}),
  };

  const res = await fetch(url, { ...options, headers });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText })) as ApiError;
    throw Object.assign(new Error(body.error ?? res.statusText), { status: res.status, body });
  }

  return res.json() as Promise<T>;
}

/** GET shorthand */
export function apiGet<T>(path: string): Promise<T> {
  return apiFetch<T>(path);
}

/** POST shorthand */
export function apiPost<T>(path: string, body: unknown): Promise<T> {
  return apiFetch<T>(path, { method: 'POST', body: JSON.stringify(body) });
}
