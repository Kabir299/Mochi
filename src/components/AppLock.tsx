import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Pet } from '@/components/Pet';
import { lockSupported, unlock } from '@/lib/lock';
import { useSettings } from '@/state/settings';
import { colors, radius, spacing } from '@/theme';

// Covers the app while it's in the app switcher, and when App lock is on, asks for
// fingerprint / Face ID / PIN on launch and after the app has been in the background.
export function AppLock() {
  const { loaded, appLock, petName } = useSettings();
  const enabled = lockSupported && appLock;
  const [locked, setLocked] = useState(false);
  const [launchChecked, setLaunchChecked] = useState(false);
  const [covered, setCovered] = useState(false);
  const busy = useRef(false);
  const wasBackground = useRef(false);

  const tryUnlock = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      if (await unlock()) setLocked(false);
    } finally {
      busy.current = false;
    }
  }, []);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      // The system unlock prompt itself makes the app 'inactive'; don't relock for that.
      if (state === 'background' && enabled) {
        wasBackground.current = true;
        setLocked(true);
      }
      setCovered(state !== 'active' && !busy.current);
      // Only prompt after a real trip to the background, not a pulled-down notification shade.
      if (state === 'active' && wasBackground.current) {
        wasBackground.current = false;
        tryUnlock();
      }
    });
    return () => sub.remove();
  }, [enabled, tryUnlock]);

  // Lock at launch only if it was already on (turning it on in Settings shouldn't lock).
  if (loaded && !launchChecked) {
    setLaunchChecked(true);
    if (enabled) setLocked(true);
  }

  useEffect(() => {
    if (locked && enabled && AppState.currentState === 'active') tryUnlock();
  }, [locked, enabled, tryUnlock]);

  if (!loaded) return null;
  const showLock = enabled && locked;
  if (!showLock && !covered) return null;

  return (
    <View style={styles.cover}>
      <Pet mood={showLock ? 'sleepy' : 'happy'} />
      {showLock && (
        <>
          <Text style={styles.title}>{petName} is keeping your data safe</Text>
          <Pressable onPress={tryUnlock} style={styles.button} accessibilityRole="button">
            <Ionicons name="lock-open-outline" size={18} color={colors.onAccent} />
            <Text style={styles.buttonText}>Unlock</Text>
          </Pressable>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  cover: {
    ...StyleSheet.absoluteFill,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.lg,
    zIndex: 1000,
  },
  title: { color: colors.text, fontSize: 17, fontWeight: '600', textAlign: 'center' },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
  },
  buttonText: { color: colors.onAccent, fontSize: 16, fontWeight: '600' },
});
