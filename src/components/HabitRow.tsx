import { Pressable, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import { Habit } from '@/state/habits';
import { colors, radius, spacing } from '@/theme';

type Props = {
  habit: Habit;
  count: number;
  streak: number;
  onCheckIn: () => void;
  onDecrement: () => void;
  onIncrement: () => void;
  // Opens the task's action menu (edit, note, focus, move, archive...).
  onMenu: () => void;
  // Shows a small note marker when the day has a note or mood.
  hasNote?: boolean;
  // Upcoming days can be seen but not checked off.
  readOnly?: boolean;
  // Extra line under the name, e.g. the planned time.
  subtitle?: string;
  // "timeline": no card, time range above a bold name and the check on the right,
  // because the timeline's coloured capsule already shows the icon.
  variant?: 'card' | 'timeline';
  style?: StyleProp<ViewStyle>;
};

export function HabitRow({
  habit,
  count,
  streak,
  onCheckIn,
  onDecrement,
  onIncrement,
  onMenu,
  hasNote = false,
  readOnly = false,
  subtitle,
  variant = 'card',
  style,
}: Props) {
  const plain = variant === 'timeline';
  const done = count >= habit.target;
  const counted = habit.target > 1;

  const check = (
    <View style={[styles.check, done ? styles.checkDone : styles.checkEmpty]}>
      {done && <Ionicons name="checkmark" size={16} color={colors.onAccent} />}
    </View>
  );

  const handlePress = () => {
    if (readOnly) return;
    const willFinish = !done && count + 1 >= habit.target;
    if (willFinish) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } else {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    onCheckIn();
  };

  return (
    <Pressable
      onPress={handlePress}
      onLongPress={onMenu}
      style={({ pressed }) => [
        styles.row,
        plain ? styles.rowPlain : done && styles.rowDone,
        style,
        pressed && !readOnly && styles.pressed,
      ]}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: done }}
      accessibilityLabel={habit.name}
    >
      {!plain && check}

      <View style={styles.body}>
        {plain && subtitle && (
          <Text style={styles.timeRange} numberOfLines={1}>
            {subtitle}
          </Text>
        )}
        <View style={styles.nameRow}>
          {!plain && <Ionicons name={habit.icon} size={16} color={colors.textMuted} />}
          <Text
            style={[styles.name, plain && styles.namePlain, done && styles.nameDone]}
            numberOfLines={plain ? 2 : 1}
          >
            {habit.name}
          </Text>
          {plain && hasNote && (
            <Ionicons name="chatbubble-ellipses-outline" size={13} color={colors.textMuted} />
          )}
        </View>
        {!plain && (subtitle || hasNote) && (
          <View style={styles.metaRow}>
            {subtitle && (
              <Text style={styles.sub} numberOfLines={1}>
                {subtitle}
              </Text>
            )}
            {hasNote && (
              <Ionicons name="chatbubble-ellipses-outline" size={13} color={colors.textMuted} />
            )}
          </View>
        )}
        {counted && (
          // The count, bar and −/+ share one line under the name, so the name
          // and time keep the row's full width even in the narrow timeline.
          <View style={styles.progressWrap}>
            <View style={styles.countRow}>
              <Text style={styles.sub}>
                {count} / {habit.target} {habit.unit}
              </Text>
              <View style={styles.track}>
                <View
                  style={[styles.fill, { width: `${Math.min(count / habit.target, 1) * 100}%` }]}
                />
              </View>
              {!readOnly && (
                <Pressable
                  onPress={() => {
                    if (count === 0) return;
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    onDecrement();
                  }}
                  hitSlop={8}
                  style={({ pressed }) => [
                    styles.minus,
                    count === 0 && styles.minusIdle,
                    pressed && styles.pressed,
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove one from ${habit.name}`}
                >
                  <Ionicons
                    name="remove"
                    size={16}
                    color={count === 0 ? colors.iconMuted : colors.text}
                  />
                </Pressable>
              )}
              {!readOnly && (
                <Pressable
                  onPress={() => {
                    if (done) return;
                    const finishing = count + 1 >= habit.target;
                    if (finishing)
                      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                    else Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    onIncrement();
                  }}
                  hitSlop={8}
                  style={({ pressed }) => [
                    styles.minus,
                    styles.plus,
                    done && styles.minusIdle,
                    pressed && styles.pressed,
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={`Add one to ${habit.name}`}
                >
                  <Ionicons
                    name="add"
                    size={16}
                    color={done ? colors.iconMuted : colors.onAccent}
                  />
                </Pressable>
              )}
            </View>
          </View>
        )}
      </View>

      {habit.repeat === 'once' ? (
        <Text style={styles.onceTag}>Today</Text>
      ) : (
        <View style={styles.streak}>
          <Ionicons
            name="flame-outline"
            size={14}
            color={streak > 0 ? colors.streak : colors.textMuted}
          />
          <Text
            style={[styles.streakText, streak === 0 && styles.streakZero]}
            accessibilityLabel={`${streak} day streak`}
          >
            {streak}d
          </Text>
        </View>
      )}
      {plain && check}
      <Pressable
        onPress={onMenu}
        hitSlop={10}
        style={styles.menuButton}
        accessibilityRole="button"
        accessibilityLabel={`More for ${habit.name}`}
      >
        <Ionicons name="ellipsis-vertical" size={18} color={colors.textMuted} />
      </Pressable>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.card,
    borderRadius: radius.card,
    paddingVertical: spacing.md + 2,
    paddingHorizontal: spacing.md + 2,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  rowPlain: {
    backgroundColor: 'transparent',
    paddingHorizontal: spacing.xs,
  },
  timeRange: {
    color: colors.textMuted,
    fontSize: 12,
    letterSpacing: 1,
    fontVariant: ['tabular-nums'],
  },
  namePlain: {
    fontSize: 17,
    fontWeight: '700',
  },
  rowDone: {
    backgroundColor: colors.doneBg,
    borderColor: colors.accentDark,
  },
  pressed: {
    opacity: 0.7,
  },
  check: {
    width: 26,
    height: 26,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkDone: {
    backgroundColor: colors.accent,
  },
  checkEmpty: {
    borderWidth: 1.5,
    borderColor: colors.checkboxBorder,
  },
  body: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  nameDone: {
    color: colors.accentLight,
  },
  name: {
    flexShrink: 1,
    color: colors.text,
    fontSize: 16,
    fontWeight: '500',
  },
  progressWrap: {
    gap: 6,
  },
  sub: {
    color: colors.textMuted,
    fontSize: 13,
  },
  countRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: 2,
  },
  track: {
    flex: 1,
    height: 3,
    borderRadius: 2,
    backgroundColor: colors.border,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    backgroundColor: colors.accent,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  menuButton: {
    paddingLeft: 2,
    paddingVertical: 4,
  },
  minus: {
    width: 30,
    height: 30,
    borderRadius: 999,
    backgroundColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  plus: {
    backgroundColor: colors.accent,
  },
  minusIdle: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: colors.border,
  },
  streak: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  streakText: {
    color: colors.streak,
    fontSize: 13,
    fontWeight: '500',
  },
  onceTag: {
    color: colors.textMuted,
    fontSize: 12,
  },
  streakZero: {
    color: colors.textMuted,
  },
});
