import { requireNativeModule } from 'expo-modules-core';

const ConduitSecurity = requireNativeModule('ConduitSecurity');

export interface SecurityReport {
  /** Device is jailbroken (iOS) or rooted (Android) */
  jailbroken: boolean;
  /** Debugger is attached to the process */
  debuggerAttached: boolean;
  /** Frida or similar instrumentation framework detected */
  fridaDetected: boolean;
  /** Running on a simulator/emulator */
  simulator: boolean;
  /** Any reverse-engineering tool detected (superset) */
  reverseEngineered: boolean;
}

/** Full security posture report. Cheap to call; all checks are synchronous under the hood. */
export async function getSecurityReport(): Promise<SecurityReport> {
  return ConduitSecurity.getSecurityReport();
}

/** True if the device appears to be jailbroken (iOS) or rooted (Android). */
export async function isJailbroken(): Promise<boolean> {
  return ConduitSecurity.isJailbroken();
}

/** True if a debugger is attached. */
export async function isDebuggerAttached(): Promise<boolean> {
  return ConduitSecurity.isDebuggerAttached();
}

/** True if Frida or similar dynamic instrumentation is detected. */
export async function isFridaDetected(): Promise<boolean> {
  return ConduitSecurity.isFridaDetected();
}

/** True if running inside a simulator or emulator. */
export async function isRunningInSimulator(): Promise<boolean> {
  return ConduitSecurity.isRunningInSimulator();
}

/**
 * Enable or disable screenshot/screen-recording protection.
 * On iOS: overlays a secure UITextField layer that blocks capture.
 * On Android: sets/clears FLAG_SECURE on the window.
 *
 * Call with `true` before displaying private keys, recovery phrases, or QR codes.
 * Call with `false` after the sensitive view is dismissed.
 */
export function enableScreenshotProtection(enable: boolean): void {
  ConduitSecurity.enableScreenshotProtection(enable);
}
