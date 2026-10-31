import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { addDays, DateKey, toDateKey } from '@/lib/dates';
import { colors } from '@/theme';

type Props = {
  today: Date;
  dayProgress: (day: DateKey) => number | null;
};

const WEEKS = 53;
const CELL = 11;
const GAP = 3;
// Sequential single-hue steps from empty to full.
const STEPS = ['#1F2A27', '#0F4A3B', '#167A5E', '#2FA383', colors.accent];

function step(value: number | null) {
  if (value === null) return null;
  if (value === 0) return STEPS[0];
  if (value < 0.4) return STEPS[1];
  if (value < 0.7) return STEPS[2];
  if (value < 1) return STEPS[3];
  return STEPS[4];
}

// GitHub-style year of daily progress, newest week on the right.
export function YearHeatmap({ today, dayProgress }: Props) {
  const mondayOffset = (today.getDay() + 6) % 7;
  const firstMonday = addDays(today, -mondayOffset - (WEEKS - 1) * 7);
  const todayKey = toDateKey(today);

  const weeks = Array.from({ length: WEEKS }, (_, w) =>
    Array.from({ length: 7 }, (_, d) => {
      const date = addDays(firstMonday, w * 7 + d);
      const key = toDateKey(date);
      return { key, date, color: key > todayKey ? 'transparent' : step(dayProgress(key)) };
    }),
  );

  return (
    <View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        // Start scrolled to the most recent weeks.
        contentOffset={{ x: 10_000, y: 0 }}
      >
        <View style={styles.grid}>
          {weeks.map((week, w) => (
            <View key={w} style={styles.week}>
              {week.map((cell) => (
                <View
                  key={cell.key}
                  style={[styles.cell, { backgroundColor: cell.color ?? colors.border }]}
                  accessibilityLabel={`${cell.date.toDateString()}`}
                />
              ))}
            </View>
          ))}
        </View>
      </ScrollView>
      <View style={styles.legend}>
        <Text style={styles.legendText}>Less</Text>
        {STEPS.map((c) => (
          <View key={c} style={[styles.cell, { backgroundColor: c }]} />
        ))}
        <Text style={styles.legendText}>More</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    gap: GAP,
  },
  week: {
    gap: GAP,
  },
  cell: {
    width: CELL,
    height: CELL,
    borderRadius: 2,
  },
  legend: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: GAP,
    marginTop: 8,
  },
  legendText: {
    color: colors.textMuted,
    fontSize: 11,
    marginHorizontal: 2,
  },
});
