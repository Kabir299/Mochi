import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { DayPoint } from '@/lib/stats';
import { colors, themedStyles } from '@/theme';

type Props = {
  points: DayPoint[];
  // Formats the value shown for the selected bar; defaults to a percentage.
  format?: (value: number) => string;
  // Value that maps to a full-height bar; defaults to 1 (100%).
  max?: number;
  gridLabels?: [string, string, string];
};

const PLOT_HEIGHT = 140;
const LABEL_WIDTH = 34;

// Single-series daily bar chart. Tap a bar to read its exact value.
export function ProgressChart({
  points,
  format = (v) => `${Math.round(v * 100)}%`,
  max = 1,
  gridLabels = ['100%', '50%', '0%'],
}: Props) {
  const [selected, setSelected] = useState(points.length - 1);
  const active = points[Math.min(selected, points.length - 1)];
  const dense = points.length > 10;

  return (
    <View>
      <Text style={styles.readout}>
        {active.date.toLocaleDateString(undefined, {
          weekday: 'short',
          day: 'numeric',
          month: 'short',
        })}
        {'  ·  '}
        <Text style={styles.readoutValue}>
          {active.value === null ? 'No habits yet' : format(active.value)}
        </Text>
      </Text>

      <View style={styles.plotRow}>
        <View style={styles.yAxis}>
          {gridLabels.map((label) => (
            <Text key={label} style={styles.axisLabel}>
              {label}
            </Text>
          ))}
        </View>

        <View style={styles.plot}>
          {[0, 0.5, 1].map((f) => (
            <View key={f} style={[styles.gridLine, { top: f * PLOT_HEIGHT }]} />
          ))}
          <View style={[styles.bars, { gap: dense ? 2 : 6 }]}>
            {points.map((p, i) => {
              const ratio = p.value === null ? 0 : Math.min(p.value / max, 1);
              const isSelected = i === selected;
              return (
                <Pressable
                  key={p.key}
                  style={styles.barSlot}
                  onPress={() => setSelected(i)}
                  accessibilityRole="button"
                  accessibilityLabel={`${p.date.toDateString()}, ${p.value === null ? 'no data' : format(p.value)}`}
                >
                  {p.value !== null && (
                    <View
                      style={[
                        styles.bar,
                        {
                          height: Math.max(ratio * PLOT_HEIGHT, 2),
                          backgroundColor:
                            ratio === 0
                              ? colors.checkboxBorder
                              : isSelected
                                ? colors.accentLight
                                : colors.accent,
                        },
                      ]}
                    />
                  )}
                </Pressable>
              );
            })}
          </View>
        </View>
      </View>

      <View style={[styles.xAxis, { marginLeft: LABEL_WIDTH, gap: dense ? 2 : 6 }]}>
        {points.map((p, i) => {
          // Dense charts label one day a week, counted back from today.
          const show = !dense || (points.length - 1 - i) % 7 === 0;
          return (
            <Text
              key={p.key}
              style={[styles.axisLabel, styles.xLabel, i === selected && styles.xLabelActive]}
              numberOfLines={1}
            >
              {show
                ? dense
                  ? p.date.getDate()
                  : p.date.toLocaleDateString(undefined, { weekday: 'narrow' })
                : ''}
            </Text>
          );
        })}
      </View>
    </View>
  );
}

const styles = themedStyles(() => ({
  readout: {
    color: colors.textMuted,
    fontSize: 13,
    marginBottom: 12,
  },
  readoutValue: {
    color: colors.text,
    fontWeight: '600',
  },
  plotRow: {
    flexDirection: 'row',
    height: PLOT_HEIGHT,
  },
  yAxis: {
    width: LABEL_WIDTH,
    justifyContent: 'space-between',
    marginTop: -7,
    marginBottom: -7,
  },
  axisLabel: {
    color: colors.textMuted,
    fontSize: 11,
  },
  plot: {
    flex: 1,
  },
  gridLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
  },
  bars: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  barSlot: {
    flex: 1,
    height: '100%',
    justifyContent: 'flex-end',
  },
  bar: {
    borderTopLeftRadius: 4,
    borderTopRightRadius: 4,
  },
  xAxis: {
    flexDirection: 'row',
    marginTop: 6,
  },
  xLabel: {
    flex: 1,
    textAlign: 'center',
  },
  xLabelActive: {
    color: colors.text,
  },
}));
