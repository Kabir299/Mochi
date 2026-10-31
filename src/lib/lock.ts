import * as LocalAuthentication from 'expo-local-authentication';
import { Platform } from 'react-native';

// Web has no biometrics, so the lock is phone-only.
export const lockSupported = Platform.OS !== 'web';

// Why the lock can't be turned on, or null when it can.
export async function lockUnavailableReason(): Promise<string | null> {
  if (!lockSupported) return 'App lock works on phones only.';
  const level = await LocalAuthentication.getEnrolledLevelAsync();
  if (level === LocalAuthentication.SecurityLevel.NONE) {
    return 'Set up a screen lock (PIN, fingerprint or face) in your phone settings first.';
  }
  return null;
}

// Fingerprint / Face ID, falling back to the phone's PIN or passcode.
export async function unlock(reason = 'Unlock Mochi') {
  const result = await LocalAuthentication.authenticateAsync({
    promptMessage: reason,
    cancelLabel: 'Cancel',
    disableDeviceFallback: false,
  });
  return result.success;
}
