import { Alert, Platform } from 'react-native';

// Alert.alert does nothing on web, so fall back to the browser's dialog there.
function ask(title: string, message: string, confirmLabel: string, destructive: boolean) {
  if (Platform.OS === 'web') {
    return Promise.resolve(window.confirm(`${title}\n\n${message}`));
  }
  return new Promise<boolean>((resolve) => {
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
      {
        text: confirmLabel,
        style: destructive ? 'destructive' : 'default',
        onPress: () => resolve(true),
      },
    ]);
  });
}

export function confirmDestructive(title: string, message: string, confirmLabel: string) {
  return ask(title, message, confirmLabel, true);
}

export function confirmAction(title: string, message: string, confirmLabel: string) {
  return ask(title, message, confirmLabel, false);
}
