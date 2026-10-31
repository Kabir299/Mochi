import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { DateKey, fromDateKey, toDateKey } from '@/lib/dates';
import { colors, radius, spacing } from '@/theme';

type Props = {
  visible: boolean;
  selected: DateKey;
  today: DateKey;
  dayStatus: (day: DateKey) => 'met' | 'frozen' | null;
  onSelect: (day: DateKey) => void;
  onClose: () => void;
};

const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

// Month grid for jumping to any day, Monday first.
export function MonthCalendar({ visible, selected, today, dayStatus, onSelect, onClose }: Props) {
  const [month, setMonth] = useState(() => {
    const d = fromDateKey(selected);
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });

  const leading = (month.getDay() + 6) % 7;
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const cells: (Date | null)[] = [
    ...Array.from({ length: leading }, () => null),
    ...Array.from(
      { length: daysInMonth },
      (_, i) => new Date(month.getFullYear(), month.getMonth(), i + 1),
    ),
  ];

  const shift = (delta: number) =>
    setMonth((m) => new Date(m.getFullYear(), m.getMonth() + delta, 1));

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.card} onPress={() => {}}>
          <View style={styles.header}>
            <Pressable onPress={() => shift(-1)} hitSlop={10} accessibilityLabel="Previous month">
              <Ionicons name="chevron-back" size={22} color={colors.text} />
            </Pressable>
            <Text style={styles.month}>
              {month.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
            </Text>
            <Pressable onPress={() => shift(1)} hitSlop={10} accessibilityLabel="Next month">
              <Ionicons name="chevron-forward" size={22} color={colors.text} />
            </Pressable>
          </View>
          <View style={styles.grid}>
            {WEEKDAYS.map((w, i) => (
              <Text key={i} style={styles.weekday}>
                {w}
              </Text>
            ))}
            {cells.map((date, i) => {
              if (!date) return <View key={`e${i}`} style={styles.cell} />;
              const key = toDateKey(date);
              const status = dayStatus(key);
              return (
                <Pressable
                  key={key}
                  onPress={() => {
                    onSelect(key);
                    onClose();
                  }}
                  style={styles.cell}
                  accessibilityLabel={date.toDateString()}
                >
                  <View
                    style={[
                      styles.dot,
                      status === 'met' && styles.met,
                      status === 'frozen' && styles.frozen,
                      key === selected && styles.selected,
                    ]}
                  >
                    <Text style={[styles.date, key === today && styles.today]}>
                      {date.getDate()}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
          <Pressable
            onPress={() => {
              onSelect(today);
              onClose();
            }}
            style={styles.todayButton}
          >
            <Text style={styles.todayText}>Today</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const CELL = `${100 / 7}%` as const;

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.card + 4,
    padding: spacing.lg,
    gap: spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  month: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '600',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  weekday: {
    width: CELL,
    textAlign: 'center',
    color: colors.textMuted,
    fontSize: 12,
    marginBottom: spacing.sm,
  },
  cell: {
    width: CELL,
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: {
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  met: {
    backgroundColor: colors.accentDark,
  },
  frozen: {
    backgroundColor: colors.waterDark,
  },
  selected: {
    borderWidth: 1.5,
    borderColor: colors.accent,
  },
  date: {
    color: colors.text,
    fontSize: 14,
  },
  today: {
    color: colors.accent,
    fontWeight: '700',
  },
  todayButton: {
    alignSelf: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  todayText: {
    color: colors.accent,
    fontSize: 15,
    fontWeight: '600',
  },
});
