import { ComponentRef, useCallback, useEffect, useRef } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { addDays, DateKey, fromDateKey, toDateKey } from '@/lib/dates';
import { colors, radius, themedStyles } from '@/theme';

type Props = {
  today: Date;
  selected: DateKey;
  onSelect: (day: DateKey) => void;
  // Filled when the day kept the streak going.
  isDayComplete: (day: DateKey) => boolean;
  // A missed day covered by a streak freeze.
  isFrozen: (day: DateKey) => boolean;
};

const DAYS_BACK = 30;
const DAYS_AHEAD = 14;
const ITEM_WIDTH = 48;
const ITEM_GAP = 6;

// Horizontal strip of dates around the selected day (a month back, two weeks ahead).
export function DayPicker({ today, selected, onSelect, isDayComplete, isFrozen }: Props) {
  const scrollRef = useRef<ComponentRef<typeof ScrollView>>(null);
  const todayKey = toDateKey(today);
  const dates = Array.from({ length: DAYS_BACK + DAYS_AHEAD + 1 }, (_, i) =>
    addDays(fromDateKey(selected), i - DAYS_BACK),
  );
  const selectedIndex = dates.findIndex((d) => toDateKey(d) === selected);

  // Keeps the selected day in the middle. The strip's width isn't known until it has been laid
  // out, and scrolling before then lands on the wrong week, so this also runs after each layout.
  const width = useRef(0);
  const centre = useCallback(
    (animated: boolean) => {
      if (width.current === 0) return;
      const x = selectedIndex * (ITEM_WIDTH + ITEM_GAP) - (width.current - ITEM_WIDTH) / 2;
      scrollRef.current?.scrollTo({ x: Math.max(0, x), animated });
    },
    [selectedIndex],
  );
  useEffect(() => centre(true), [centre, selected]);

  return (
    <ScrollView
      ref={scrollRef}
      horizontal
      showsHorizontalScrollIndicator={false}
      onLayout={(e) => {
        width.current = e.nativeEvent.layout.width;
        centre(false);
      }}
      onContentSizeChange={() => centre(false)}
      contentContainerStyle={styles.row}
    >
      {dates.map((date) => {
        const key = toDateKey(date);
        const isSelected = key === selected;
        const isToday = key === todayKey;
        const isFuture = key > todayKey;
        const complete = isDayComplete(key);
        const frozen = !complete && !isFuture && isFrozen(key);
        return (
          <Pressable
            key={key}
            onPress={() => onSelect(key)}
            style={[styles.item, isSelected && styles.itemSelected]}
            accessibilityRole="button"
            accessibilityState={{ selected: isSelected }}
            accessibilityLabel={date.toDateString()}
          >
            <Text style={[styles.weekday, isToday && styles.today]}>
              {isToday ? 'Today' : date.toLocaleDateString(undefined, { weekday: 'short' })}
            </Text>
            <View style={[styles.dot, complete && styles.dotComplete, frozen && styles.dotFrozen]}>
              {frozen ? (
                <Ionicons name="snow-outline" size={15} color={colors.water} />
              ) : (
                <Text
                  style={[
                    styles.date,
                    complete && styles.dateComplete,
                    isFuture && styles.dateFuture,
                  ]}
                >
                  {date.getDate()}
                </Text>
              )}
            </View>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = themedStyles(() => ({
  row: {
    gap: ITEM_GAP,
    paddingVertical: 2,
  },
  item: {
    width: ITEM_WIDTH,
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    borderRadius: radius.card,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  itemSelected: {
    borderColor: colors.accent,
    backgroundColor: colors.card,
  },
  weekday: {
    color: colors.textMuted,
    fontSize: 11,
  },
  today: {
    color: colors.accent,
    fontWeight: '600',
  },
  dot: {
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotComplete: {
    backgroundColor: colors.accentDark,
  },
  dotFrozen: {
    backgroundColor: colors.waterDark,
  },
  date: {
    color: colors.text,
    fontSize: 14,
  },
  dateComplete: {
    color: colors.accentLight,
  },
  dateFuture: {
    color: colors.iconMuted,
  },
}));
