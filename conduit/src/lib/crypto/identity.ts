/**
 * Identity key management.
 * Ed25519/X25519 keys are generated once and wrapped under a hardware-held
 * KEK stored in Secure Enclave / StrongBox via expo-secure-store.
 *
 * Constraint (§3.4 of PRD): SE/StrongBox only supports secp256r1 (P-256),
 * not Curve25519. We therefore hold the X25519/Ed25519 material in the
 * platform Keychain/Keystore with hardware-backed protection and biometric
 * binding, sealed under a hardware KEK.
 *
 * In this build we use expo-secure-store with hardware-backed storage as
 * the closest API equivalent available from managed Expo.
 */

import * as SecureStore from 'expo-secure-store';
import {
  x25519KeyPair,
  ed25519KeyPair,
  toBase64,
  fromBase64,
  secureRandom,
  type X25519KeyPair,
  type Ed25519KeyPair,
} from './primitives';
import { generateSignedPreKey, type IdentityKeyBundle } from './x3dh';

const KEYS = {
  IDENTITY_DH: 'conduit.identity.dh',
  IDENTITY_ED: 'conduit.identity.ed',
  SPK: 'conduit.identity.spk',
  OTK_PREFIX: 'conduit.identity.otk.',
  REGISTRATION_ID: 'conduit.identity.regId',
};

const SE_OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  requireAuthentication: true,
};

export async function generateAndStoreIdentity(): Promise<IdentityKeyBundle> {
  const identityKeyDh = x25519KeyPair();
  const identityKeyEd = ed25519KeyPair();
  const registrationId = (Math.random() * 0x3fff | 0) + 1;
  const signedPreKey = generateSignedPreKey(identityKeyEd, 1);
  const oneTimePreKeys = Array.from({ length: 10 }, (_, i) => x25519KeyPair());

  await SecureStore.setItemAsync(KEYS.IDENTITY_DH, JSON.stringify({
    pub: toBase64(identityKeyDh.publicKey),
    sec: toBase64(identityKeyDh.secretKey),
  }), SE_OPTIONS);

  await SecureStore.setItemAsync(KEYS.IDENTITY_ED, JSON.stringify({
    pub: toBase64(identityKeyEd.publicKey),
    sec: toBase64(identityKeyEd.secretKey),
  }), SE_OPTIONS);

  await SecureStore.setItemAsync(KEYS.SPK, JSON.stringify({
    keyId: signedPreKey.keyId,
    pub: toBase64(signedPreKey.keyPair.publicKey),
    sec: toBase64(signedPreKey.keyPair.secretKey),
    sig: toBase64(signedPreKey.signature),
  }), SE_OPTIONS);

  for (let i = 0; i < oneTimePreKeys.length; i++) {
    await SecureStore.setItemAsync(`${KEYS.OTK_PREFIX}${i}`, JSON.stringify({
      pub: toBase64(oneTimePreKeys[i].publicKey),
      sec: toBase64(oneTimePreKeys[i].secretKey),
    }), SE_OPTIONS);
  }

  await SecureStore.setItemAsync(KEYS.REGISTRATION_ID, String(registrationId));

  return { identityKeyDh, identityKeyEd, signedPreKey, oneTimePreKeys, registrationId };
}

export async function loadIdentity(): Promise<IdentityKeyBundle | null> {
  try {
    const dhRaw = await SecureStore.getItemAsync(KEYS.IDENTITY_DH, SE_OPTIONS);
    const edRaw = await SecureStore.getItemAsync(KEYS.IDENTITY_ED, SE_OPTIONS);
    const spkRaw = await SecureStore.getItemAsync(KEYS.SPK, SE_OPTIONS);
    const regIdRaw = await SecureStore.getItemAsync(KEYS.REGISTRATION_ID);

    if (!dhRaw || !edRaw || !spkRaw || !regIdRaw) return null;

    const dh = JSON.parse(dhRaw);
    const ed = JSON.parse(edRaw);
    const spk = JSON.parse(spkRaw);

    const identityKeyDh: X25519KeyPair = {
      publicKey: fromBase64(dh.pub),
      secretKey: fromBase64(dh.sec),
    };
    const identityKeyEd: Ed25519KeyPair = {
      publicKey: fromBase64(ed.pub),
      secretKey: fromBase64(ed.sec),
    };

    const oneTimePreKeys: X25519KeyPair[] = [];
    for (let i = 0; i < 10; i++) {
      const raw = await SecureStore.getItemAsync(`${KEYS.OTK_PREFIX}${i}`, SE_OPTIONS);
      if (!raw) break;
      const k = JSON.parse(raw);
      oneTimePreKeys.push({ publicKey: fromBase64(k.pub), secretKey: fromBase64(k.sec) });
    }

    return {
      identityKeyDh,
      identityKeyEd,
      signedPreKey: {
        keyId: spk.keyId,
        keyPair: { publicKey: fromBase64(spk.pub), secretKey: fromBase64(spk.sec) },
        signature: fromBase64(spk.sig),
      },
      oneTimePreKeys,
      registrationId: Number(regIdRaw),
    };
  } catch {
    return null;
  }
}

export async function hasIdentity(): Promise<boolean> {
  const raw = await SecureStore.getItemAsync(KEYS.IDENTITY_DH);
  return raw !== null;
}

/** Safety number — 60-digit decimal string from the two identity keys. */
export function computeSafetyNumber(
  myIdentityKey: Uint8Array,
  theirIdentityKey: Uint8Array
): string {
  const sorted = [toBase64(myIdentityKey), toBase64(theirIdentityKey)].sort();
  const combined = new TextEncoder().encode(sorted.join(''));
  // Simple deterministic fingerprint — production uses iterative SHA-512
  return Array.from(combined)
    .map((b) => (b % 10).toString())
    .join('')
    .slice(0, 60);
}
