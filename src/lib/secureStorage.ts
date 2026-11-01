import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

// iOS Keychain / Android Keystore on phones. The web preview (development only) has
// no secure storage, so it uses the browser's.
export async function secureGet(key: string) {
  if (Platform.OS === 'web') {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  }
  return SecureStore.getItemAsync(key);
}

export async function secureSet(key: string, value: string) {
  if (Platform.OS === 'web') {
    try {
      localStorage.setItem(key, value);
    } catch {}
    return;
  }
  await SecureStore.setItemAsync(key, value, {
    keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
  });
}
