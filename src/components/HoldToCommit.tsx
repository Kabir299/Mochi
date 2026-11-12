import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Platform, Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import { colors, radius, spacing, themedStyles } from '@/theme';

const HOLD_MS = 4500;
const SIZE = 168;
const native = Platform.OS !== 'web';

// Press and hold like a thumbprint scan. Letting go early drains it back, so it only counts
// when they mean it.
export function HoldToCommit({ onDone }: { onDone: () => void }) {
  const [progress] = useState(() => new Animated.Value(0));
  const ticks = useRef<ReturnType<typeof setInterval> | null>(null);
  const finish = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Each press gets a number, so a press that already ended can't start the countdown.
  const press = useRef(0);
  const [state, setState] = useState<'idle' | 'holding' | 'done'>('idle');

  const stopTimers = () => {
    if (ticks.current) clearInterval(ticks.current);
    if (finish.current) clearTimeout(finish.current);
    ticks.current = null;
    finish.current = null;
  };
  useEffect(() => stopTimers, []);

  const start = () => {
    if (state === 'done') return;
    setState('holding');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    // Picks up from wherever the drain had got to after letting go.
    const mine = ++press.current;
    progress.stopAnimation((from) => {
      if (mine !== press.current) return;
      const left = HOLD_MS * (1 - from);
      const began = Date.now();
      // A heartbeat that gets stronger as it fills.
      ticks.current = setInterval(() => {
        const filled = from + (Date.now() - began) / HOLD_MS;
        const style =
          filled > 0.66
            ? Haptics.ImpactFeedbackStyle.Heavy
            : filled > 0.33
              ? Haptics.ImpactFeedbackStyle.Medium
              : Haptics.ImpactFeedbackStyle.Light;
        Haptics.impactAsync(style).catch(() => {});
      }, 450);
      Animated.timing(progress, {
        toValue: 1,
        duration: left,
        easing: Easing.linear,
        useNativeDriver: native,
      }).start();
      // Timed by the clock, not the animation, so a dropped frame can't stop it counting.
      finish.current = setTimeout(() => {
        stopTimers();
        progress.setValue(1);
        setState('done');
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        setTimeout(onDone, 900);
      }, left);
    });
  };

  const release = () => {
    if (state !== 'holding') return;
    press.current++;
    stopTimers();
    progress.stopAnimation();
    setState('idle');
    Animated.timing(progress, {
      toValue: 0,
      duration: 350,
      easing: Easing.out(Easing.quad),
      useNativeDriver: native,
    }).start();
  };

  const label =
    state === 'done' ? 'Locked in.' : state === 'holding' ? 'Keep holding…' : 'Hold to commit';

  return (
    <View style={styles.wrap}>
      <Pressable
        onPressIn={start}
        onPressOut={release}
        style={styles.ring}
        accessibilityRole="button"
        accessibilityLabel="Press and hold for a few seconds to commit"
        accessibilityState={{ disabled: state === 'done' }}
      >
        <Animated.View
          style={[
            styles.fill,
            { opacity: progress.interpolate({ inputRange: [0, 0.05, 1], outputRange: [0, 0.5, 1] }) },
            { transform: [{ scale: progress }] },
          ]}
        />
        <Ionicons
          name={state === 'done' ? 'checkmark' : 'finger-print'}
          size={84}
          color={state === 'done' ? colors.onAccent : colors.text}
        />
      </Pressable>
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

const styles = themedStyles(() => ({
  wrap: {
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.lg,
  },
  ring: {
    width: SIZE,
    height: SIZE,
    borderRadius: radius.pill,
    borderWidth: 3,
    borderColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  fill: {
    position: 'absolute',
    width: SIZE,
    height: SIZE,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
  },
  label: {
    color: colors.textMuted,
    fontSize: 15,
    fontWeight: '600',
  },
}));
