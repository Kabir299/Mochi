import { ComponentRef, useEffect, useRef, useState } from 'react';
import {
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as Haptics from 'expo-haptics';

import { formatMinute } from '@/lib/dates';
import { colors, radius } from '@/theme';

const STEP = 15;
const ROW = 44;
const RIM = 2; // Rows shown above and below the selected one.
const DAY_MINUTES = 24 * 60;
const GRID = Array.from({ length: DAY_MINUTES / STEP }, (_, i) => i * STEP);
const RIM_OPACITY = [1, 0.6, 0.3];

// Scroll to pick a start time; the highlighted row shows when the task would run.
export function TimeWheel({
  value,
  durationMin,
  onChange,
}: {
  value: number;
  durationMin: number;
  onChange: (minute: number) => void;
}) {
  // A time off the 15-minute grid (say 9:10) gets its own row so it isn't rounded away.
  const [offGrid, setOffGrid] = useState<number | null>(null);
  if (value % STEP !== 0 && value !== offGrid) setOffGrid(value);
  const times = offGrid === null ? GRID : [...GRID, offGrid].sort((a, b) => a - b);
  const index = Math.max(0, times.indexOf(value));

  const scroller = useRef<ComponentRef<typeof ScrollView>>(null);
  // The last time this wheel reported, to tell a scroll from a change made elsewhere.
  const reported = useRef(value);

  const scrollTo = (i: number, animated: boolean) =>
    scroller.current?.scrollTo({ y: i * ROW, animated });

  useEffect(() => {
    if (value === reported.current) return;
    reported.current = value;
    scroller.current?.scrollTo({ y: index * ROW, animated: false });
  }, [value, index]);

  const onScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const i = Math.round(event.nativeEvent.contentOffset.y / ROW);
    const minute = times[Math.min(times.length - 1, Math.max(0, i))];
    if (minute === reported.current) return;
    reported.current = minute;
    Haptics.selectionAsync();
    onChange(minute);
  };

  const end = (value + durationMin) % DAY_MINUTES;

  return (
    <View
      style={styles.wheel}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel="Start time"
      accessibilityValue={{ text: formatMinute(value) }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(event) => {
        const next = index + (event.nativeEvent.actionName === 'increment' ? 1 : -1);
        if (next >= 0 && next < times.length) scrollTo(next, true);
      }}
    >
      <ScrollView
        ref={scroller}
        showsVerticalScrollIndicator={false}
        nestedScrollEnabled
        snapToInterval={ROW}
        decelerationRate="fast"
        scrollEventThrottle={16}
        onScroll={onScroll}
        onLayout={() => scrollTo(index, false)}
        contentContainerStyle={styles.rows}
      >
        {times.map((minute, i) => {
          const away = Math.abs(i - index);
          return (
            <Pressable key={minute} onPress={() => scrollTo(i, true)} style={styles.row}>
              <Text style={[styles.time, { opacity: RIM_OPACITY[away] ?? 0.15 }]}>
                {formatMinute(minute)}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
      <View style={styles.selected}>
        <Text style={styles.selectedText}>
          {formatMinute(value)} – {formatMinute(end)}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wheel: {
    height: ROW * (RIM * 2 + 1),
    overflow: 'hidden',
  },
  rows: {
    paddingVertical: ROW * RIM,
  },
  row: {
    height: ROW,
    alignItems: 'center',
    justifyContent: 'center',
  },
  time: {
    color: colors.text,
    fontSize: 16,
  },
  selected: {
    position: 'absolute',
    top: ROW * RIM,
    left: 32,
    right: 32,
    height: ROW,
    borderRadius: radius.card,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    pointerEvents: 'none',
  },
  selectedText: {
    color: colors.onAccent,
    fontSize: 16,
    fontWeight: '600',
  },
});
