import { ComponentRef, memo, useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  Text,
  View,
} from 'react-native';
import * as Haptics from 'expo-haptics';

import { formatMinute } from '@/lib/dates';
import { colors, radius, themedStyles } from '@/theme';

const STEP = 15;
const ROW = 44;
const RIM = 2; // Rows shown above and below the selected one.
const DAY_MINUTES = 24 * 60;
const GRID = Array.from({ length: DAY_MINUTES / STEP }, (_, i) => i * STEP);
// How long the wheel must be still before the form hears about the new time.
const SETTLE_MS = 120;

// Fading runs on the native side and rows never re-render, so scrolling stays smooth.
const WheelRow = memo(function WheelRow({
  index,
  minute,
  scrollY,
  onPick,
}: {
  index: number;
  minute: number;
  scrollY: Animated.Value;
  onPick: (index: number) => void;
}) {
  const centre = index * ROW;
  const opacity = scrollY.interpolate({
    inputRange: [centre - ROW * 3, centre - ROW, centre, centre + ROW, centre + ROW * 3],
    outputRange: [0.12, 0.6, 1, 0.6, 0.12],
    extrapolate: 'clamp',
  });
  return (
    <Pressable onPress={() => onPick(index)} style={styles.row}>
      <Animated.Text style={[styles.time, { opacity }]}>{formatMinute(minute)}</Animated.Text>
    </Pressable>
  );
});

// Scroll to pick a time. Used for both when a task starts and when it ends.
export function TimeWheel({
  value,
  onChange,
  label = 'Start time',
}: {
  value: number;
  onChange: (minute: number) => void;
  label?: string;
}) {
  // A time off the 15-minute grid (say 9:10) gets its own row so it isn't rounded away.
  const [offGrid, setOffGrid] = useState<number | null>(null);
  if (value % STEP !== 0 && value !== offGrid) setOffGrid(value);
  const times = offGrid === null ? GRID : [...GRID, offGrid].sort((a, b) => a - b);

  // The time under the highlight, which moves ahead of `value` while scrolling.
  const [centre, setCentre] = useState(value);
  const [lastValue, setLastValue] = useState(value);
  if (value !== lastValue) {
    setLastValue(value);
    setCentre(value);
  }

  const index = Math.max(0, times.indexOf(value));
  const scroller = useRef<ComponentRef<typeof Animated.ScrollView>>(null);
  const [scrollY] = useState(() => new Animated.Value(index * ROW));
  // The time the form last heard about, and the latest one under the highlight.
  const reported = useRef(value);
  const latest = useRef(value);
  const settle = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });

  const report = useCallback(() => {
    if (settle.current) clearTimeout(settle.current);
    settle.current = null;
    if (latest.current === reported.current) return;
    reported.current = latest.current;
    onChangeRef.current(latest.current);
  }, []);

  // Leaving the step mid-scroll still keeps the time on show.
  useEffect(() => report, [report]);

  // A time set from outside the wheel, like the phone's clock.
  useEffect(() => {
    if (value === reported.current) return;
    reported.current = value;
    latest.current = value;
    scroller.current?.scrollTo({ y: index * ROW, animated: false });
  }, [value, index]);

  const onScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const i = Math.round(event.nativeEvent.contentOffset.y / ROW);
    const minute = times[Math.min(times.length - 1, Math.max(0, i))];
    if (settle.current) clearTimeout(settle.current);
    settle.current = setTimeout(report, SETTLE_MS);
    if (minute === latest.current) return;
    latest.current = minute;
    setCentre(minute);
    Haptics.selectionAsync();
  };

  // Made once: replacing a native scroll event on each render would make scrolling stutter.
  const onScrollRef = useRef(onScroll);
  useEffect(() => {
    onScrollRef.current = onScroll;
  });
  // The listener only reads the ref when a scroll happens, never during render.
  // eslint-disable-next-line react-hooks/refs
  const [scrollEvent] = useState(() =>
    Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], {
      useNativeDriver: true,
      listener: (event: NativeSyntheticEvent<NativeScrollEvent>) => onScrollRef.current(event),
    }),
  );

  const pick = useCallback((i: number) => {
    scroller.current?.scrollTo({ y: i * ROW, animated: true });
  }, []);

  const centreIndex = Math.max(0, times.indexOf(centre));

  return (
    <View
      style={styles.wheel}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={label}
      accessibilityValue={{ text: formatMinute(centre) }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(event) => {
        const next = centreIndex + (event.nativeEvent.actionName === 'increment' ? 1 : -1);
        if (next >= 0 && next < times.length) pick(next);
      }}
    >
      <Animated.ScrollView
        ref={scroller}
        showsVerticalScrollIndicator={false}
        nestedScrollEnabled
        overScrollMode="never"
        snapToInterval={ROW}
        decelerationRate="normal"
        scrollEventThrottle={16}
        onScroll={scrollEvent}
        onLayout={() => scroller.current?.scrollTo({ y: index * ROW, animated: false })}
        contentContainerStyle={styles.rows}
      >
        {times.map((minute, i) => (
          <WheelRow key={minute} index={i} minute={minute} scrollY={scrollY} onPick={pick} />
        ))}
      </Animated.ScrollView>
      <View style={styles.selected}>
        <Text style={styles.selectedText}>{formatMinute(centre)}</Text>
      </View>
    </View>
  );
}

const styles = themedStyles(() => ({
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
}));
