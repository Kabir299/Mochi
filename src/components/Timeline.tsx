import { Fragment, ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { formatDuration, formatMinute } from '@/lib/dates';
import type { Habit } from '@/state/habits';
import { colors, radius, spacing } from '@/theme';

type Props = {
  habits: Habit[];
  isDone: (habit: Habit) => boolean;
  // Minutes after midnight right now, only when showing today.
  nowMinute: number | null;
  renderRow: (habit: Habit, minHeight: number) => ReactNode;
};

const RAIL = 64;
const PILL_WIDTH = 46;
// Capsules grow with the task's length (a 15-minute task is a circle), but are capped.
const MIN_PILL = 46;
const PX_PER_MIN = 1.6;
const MAX_PILL = 150;

// Soft colours handed out per habit so the day reads at a glance.
const PILL_COLORS = ['#E8918A', '#7C9CC4', '#B56A8F', '#8FC77E', '#E3B262', '#9C8FD6', '#6FBFB5'];
export const pillColor = (habit: Habit) => PILL_COLORS[habit.id % PILL_COLORS.length];

const end = (h: Habit) => h.startMinute! + (h.durationMin ?? 0);

// A visual plan of the day: a thin line with a coloured capsule per task, its
// height following the task's length, free time between tasks, and a "now" line.
export function Timeline({ habits, isDone, nowMinute, renderRow }: Props) {
  const sorted = [...habits].sort((a, b) => a.startMinute! - b.startMinute!);
  const nowIndex = nowMinute === null ? -1 : sorted.findIndex((h) => h.startMinute! > nowMinute);

  const nowLine = (
    <View style={styles.nowRow} accessibilityLabel={`Now, ${formatMinute(nowMinute ?? 0)}`}>
      <View style={styles.nowRail}>
        <View style={styles.nowDot} />
      </View>
      <View style={styles.nowLine} />
      <Text style={styles.nowText}>{formatMinute(nowMinute ?? 0)}</Text>
    </View>
  );

  return (
    <View>
      {sorted.map((habit, i) => {
        const done = isDone(habit);
        const duration = habit.durationMin ?? 0;
        const height = Math.min(Math.max(MIN_PILL, duration * PX_PER_MIN), MAX_PILL);
        const next = sorted[i + 1];
        const gap = next ? next.startMinute! - end(habit) : 0;
        return (
          <Fragment key={habit.id}>
            {i === nowIndex && nowLine}
            <View style={styles.row}>
              <View style={styles.rail}>
                <View style={[styles.railLine, styles.railBehind]} />
                <View
                  style={[
                    styles.pill,
                    { height, backgroundColor: pillColor(habit) },
                    done && styles.pillDone,
                  ]}
                >
                  <Ionicons name={done ? 'checkmark' : habit.icon} size={20} color="#FFFFFF" />
                </View>
              </View>
              <View style={styles.content}>{renderRow(habit, height)}</View>
            </View>
            {gap >= 15 && (
              <View style={styles.gapRow}>
                <View style={styles.rail}>
                  <View style={[styles.railLine, styles.railBehind]} />
                </View>
                <Text style={styles.gapText}>Free · {formatDuration(gap)}</Text>
              </View>
            )}
          </Fragment>
        );
      })}
      {nowIndex === -1 && nowMinute !== null && sorted.length > 0 && nowLine}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  rail: {
    width: RAIL,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
  },
  railLine: {
    width: 2,
    backgroundColor: '#4A3A3A',
  },
  // The line runs behind every capsule, top to bottom, so the day reads as one track.
  railBehind: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: RAIL / 2 - 1,
  },
  pill: {
    width: PILL_WIDTH,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillDone: {
    opacity: 0.55,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
  },
  gapRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 30,
  },
  gapText: {
    color: colors.iconMuted,
    fontSize: 12,
  },
  nowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 4,
    gap: spacing.sm,
  },
  nowRail: {
    width: RAIL,
    alignItems: 'center',
  },
  nowDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.danger,
  },
  nowLine: {
    flex: 1,
    height: 1.5,
    backgroundColor: colors.danger,
  },
  nowText: {
    color: colors.danger,
    fontSize: 11,
    fontWeight: '600',
  },
});
