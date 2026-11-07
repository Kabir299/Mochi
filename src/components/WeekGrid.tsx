import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { DateKey, toDateKey, weekDays } from '@/lib/dates';
import type { Habit } from '@/state/habits';
import { colors, radius, spacing, themedStyles } from '@/theme';

type Props = {
  anchor: Date;
  todayKey: DateKey;
  habits: Habit[];
  isScheduled: (habit: Habit, day: DateKey) => boolean;
  progressOf: (habit: Habit, day: DateKey) => number;
  dayProgress: (day: DateKey) => number | null;
  onToggle: (habit: Habit, day: DateKey) => void;
  onSelectDay: (day: DateKey) => void;
};

const LABEL_WIDTH = 104;

// The whole week at a glance: one row per habit, one column per day.
// Tap a cell to check in, or a day header to open that day.
export function WeekGrid({
  anchor,
  todayKey,
  habits,
  isScheduled,
  progressOf,
  dayProgress,
  onToggle,
  onSelectDay,
}: Props) {
  const days = weekDays(anchor).map((d) => ({ date: d, key: toDateKey(d) }));
  const rows = habits.filter((h) => days.some((d) => isScheduled(h, d.key)));

  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <View style={{ width: LABEL_WIDTH }} />
        {days.map(({ date, key }) => {
          const p = dayProgress(key);
          return (
            <Pressable
              key={key}
              style={styles.headCell}
              onPress={() => onSelectDay(key)}
              accessibilityLabel={`Open ${date.toDateString()}`}
            >
              <Text style={[styles.headDay, key === todayKey && styles.today]}>
                {date.toLocaleDateString(undefined, { weekday: 'narrow' })}
              </Text>
              <Text style={styles.headPct}>{p === null ? '' : `${Math.round(p * 100)}`}</Text>
            </Pressable>
          );
        })}
      </View>

      {rows.length === 0 && <Text style={styles.empty}>Nothing scheduled this week.</Text>}

      {rows.map((habit) => (
        <View key={habit.id} style={styles.row}>
          <View style={styles.label}>
            <Ionicons name={habit.icon} size={14} color={colors.textMuted} />
            <Text style={styles.labelText} numberOfLines={1}>
              {habit.name}
            </Text>
          </View>
          {days.map(({ key }) => {
            if (!isScheduled(habit, key)) {
              return (
                <View key={key} style={styles.cell}>
                  <View style={styles.off} />
                </View>
              );
            }
            const p = progressOf(habit, key);
            return (
              <Pressable
                key={key}
                style={styles.cell}
                onPress={() => onToggle(habit, key)}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: p >= 1 }}
                accessibilityLabel={`${habit.name} on ${key}`}
              >
                <View
                  style={[
                    styles.mark,
                    p >= 1 && styles.markDone,
                    p > 0 && p < 1 && styles.markPartial,
                  ]}
                >
                  {p >= 1 && <Ionicons name="checkmark" size={14} color={colors.onAccent} />}
                </View>
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const styles = themedStyles(() => ({
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    padding: spacing.md,
    gap: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headCell: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  headDay: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },
  today: {
    color: colors.accent,
  },
  headPct: {
    color: colors.iconMuted,
    fontSize: 10,
    minHeight: 12,
  },
  label: {
    width: LABEL_WIDTH,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingRight: 4,
  },
  labelText: {
    flex: 1,
    color: colors.text,
    fontSize: 13,
  },
  cell: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 4,
  },
  mark: {
    width: 24,
    height: 24,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.checkboxBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  markDone: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  markPartial: {
    borderColor: colors.accent,
    backgroundColor: colors.accentDark,
  },
  off: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.border,
  },
  empty: {
    color: colors.textMuted,
    fontSize: 13,
    textAlign: 'center',
    paddingVertical: spacing.md,
  },
}));
