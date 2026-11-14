import { useRef, useState } from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { closeModal } from '@/lib/nav';
import { KeyboardLift } from '@/components/KeyboardLift';
import { Segmented } from '@/components/Segmented';
import { TimeWheel } from '@/components/TimeWheel';
import { confirmDestructive } from '@/lib/confirm';
import { guessIcon, HABIT_ICONS } from '@/lib/icons';
import { formatDuration, formatMinute, fromDateKey, toDateKey } from '@/lib/dates';
import { nextFreeMinute, rememberAddedTask } from '@/lib/nextSlot';
import { Habit, IconName, Repeat, useHabits } from '@/state/habits';
import { useSettings } from '@/state/settings';
import { colors, radius, spacing, themedStyles } from '@/theme';

const MAX_TARGET = 99;

const TIME_OPTIONS = [
  ['timed', 'At a set time'],
  ['anytime', 'Any time'],
] as const;
type TimeMode = (typeof TIME_OPTIONS)[number][0];
const TIME_STEP = 15;
const DAY_MINUTES = 24 * 60;

// Next quarter hour from now, as the default start for new timed habits.
function nextQuarterHour() {
  const now = new Date();
  return (
    (Math.ceil((now.getHours() * 60 + now.getMinutes()) / TIME_STEP) * TIME_STEP) % DAY_MINUTES
  );
}

type Kind = 'check' | 'count';

// Monday first, values are JS weekdays (0 = Sunday).
const WEEKDAYS = [
  [1, 'M', 'Monday'],
  [2, 'T', 'Tuesday'],
  [3, 'W', 'Wednesday'],
  [4, 'T', 'Thursday'],
  [5, 'F', 'Friday'],
  [6, 'S', 'Saturday'],
  [0, 'S', 'Sunday'],
] as const;

const REPEAT_OPTIONS = [
  ['once', 'Just once'],
  ['daily', 'Every day'],
  ['days', 'Some days'],
] as const;

const WORTH_OPTIONS = [
  ['1', 'Low · 1'],
  ['2', 'Medium · 2'],
  ['3', 'High · 3'],
] as const;
type Worth = (typeof WORTH_OPTIONS)[number][0];

const GOAL_OPTIONS = [
  ['check', 'Check off'],
  ['count', 'Count up'],
] as const;

type Step = 'what' | 'when' | 'minutes' | 'full';
const QUICK_STEPS: Step[] = ['what', 'when', 'minutes'];
const QUICK_MINUTES = [5, 10, 15, 20, 30, 45, 60, 90, 120, 180, 240];

// Waits for habits to load so the form's initial state comes from the saved
// habit, even when opened by a link or after a reload.
export default function HabitFormScreen() {
  // `day` is the day being viewed when the add button was tapped.
  const { id, day } = useLocalSearchParams<{ id?: string; day?: string }>();
  const { loaded, getHabit } = useHabits();
  if (!loaded) return <SafeAreaView style={styles.safe} />;
  const existing = id ? getHabit(Number(id)) : undefined;
  if (id && !existing) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.notFound}>
          <Text style={styles.notFoundTitle}>Habit not found</Text>
          <Text style={styles.helper}>It may have been deleted.</Text>
          <Pressable onPress={closeModal} hitSlop={12}>
            <Text style={styles.notFoundLink}>Go back</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }
  const forDay = day ?? toDateKey(new Date());
  return <HabitForm key={existing?.id ?? 'new'} existing={existing} forDay={forDay} />;
}

function HabitForm({ existing, forDay }: { existing: Habit | undefined; forDay: string }) {
  const todayKey = toDateKey(new Date());
  // A task added while viewing another day defaults to a one-off on that day.
  const otherDay = !existing && forDay !== todayKey;
  const onceDay = existing?.onceDay ?? forDay;
  const dayLabel =
    onceDay === todayKey
      ? 'today'
      : fromDateKey(onceDay).toLocaleDateString(undefined, {
          weekday: 'long',
          day: 'numeric',
          month: 'short',
        });
  const { addHabit, editHabit, removeHabit, archiveHabit, habitsOn } = useHabits();

  // During the first-run guide the form comes filled in, so it's just a few taps.
  const { guideSeen } = useSettings();
  const [name, setName] = useState(existing?.name ?? (guideSeen ? '' : 'Read 10 pages'));
  const [icon, setIcon] = useState<IconName>(existing?.icon ?? HABIT_ICONS[0]);
  const [kind, setKind] = useState<Kind>(existing && existing.target > 1 ? 'count' : 'check');
  const [target, setTarget] = useState(existing && existing.target > 1 ? existing.target : 8);
  const [unit, setUnit] = useState(existing?.unit ?? '');
  const [repeat, setRepeat] = useState<Repeat>(existing?.repeat ?? 'once');
  const [worth, setWorth] = useState<Worth>(String(existing?.weight ?? 2) as Worth);
  const [timeMode, setTimeMode] = useState<TimeMode>(
    existing && existing.startMinute === null ? 'anytime' : 'timed',
  );
  const [startMinute, setStartMinute] = useState(
    () =>
      existing?.startMinute ??
      nextFreeMinute(
        forDay,
        nextQuarterHour(),
        habitsOn(forDay).flatMap((h) =>
          h.startMinute === null ? [] : [{ start: h.startMinute, duration: h.durationMin ?? 30 }],
        ),
      ),
  );
  const [durationMin, setDurationMin] = useState(existing?.durationMin ?? 30);
  // Picking an end time sets the length, so a task can run as long as it needs, past midnight
  // too. Moving the start keeps the length.
  const endMinute = (startMinute + durationMin) % DAY_MINUTES;
  const setEnd = (minute: number) => {
    const length = (minute - startMinute + DAY_MINUTES) % DAY_MINUTES;
    if (length > 0) setDurationMin(length);
  };
  const [days, setDays] = useState<number[]>(
    existing?.days.length ? existing.days : [1, 2, 3, 4, 5],
  );
  const [daysError, setDaysError] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // New tasks are added one question at a time; editing shows everything at once.
  const [step, setStep] = useState<Step>(existing ? 'full' : 'what');
  const [iconPicked, setIconPicked] = useState(!!existing);
  const [customMinutes, setCustomMinutes] = useState('');
  const quick = step !== 'full';

  const changeName = (text: string) => {
    setName(text);
    setError(null);
    if (!iconPicked) setIcon(guessIcon(text));
  };

  // The Next button stays in place between steps, so a quick double tap would skip one.
  const lastStepAt = useRef(0);
  const nextStep = () => {
    if (Date.now() - lastStepAt.current < 400) return;
    lastStepAt.current = Date.now();
    if (step === 'what') {
      if (!name.trim()) {
        setError('What do you want to do?');
        return;
      }
      setStep('when');
    } else if (step === 'when') {
      if (repeat === 'days' && days.length === 0) {
        setDaysError(true);
        return;
      }
      setStep('minutes');
    }
  };

  const save = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Enter a habit name');
      return;
    }
    if (repeat === 'days' && days.length === 0) {
      setDaysError(true);
      return;
    }
    const input = {
      name: trimmed,
      icon,
      target: kind === 'count' ? target : 1,
      unit: kind === 'count' ? unit.trim() || null : null,
      repeat,
      weight: Number(worth),
      startMinute: timeMode === 'timed' ? startMinute : null,
      // The quick flow always asks how long, which also helps Plan my day place it.
      durationMin: timeMode === 'timed' || quick ? durationMin : null,
      days: [...days].sort(),
      // A one-off task is due today, or keeps its day when edited.
      onceDay: existing?.onceDay ?? forDay,
      // Repeating habits added on a past day count from that day.
      startDay: existing ? existing.startDay : forDay < todayKey ? forDay : undefined,
    };
    setSaving(true);
    try {
      if (existing) {
        await editHabit(existing.id, input);
      } else {
        await addHabit(input);
        if (input.startMinute !== null) {
          rememberAddedTask(forDay, input.startMinute, input.durationMin ?? 30);
        }
      }
      closeModal();
    } catch {
      setError("Couldn't save this habit. Try again.");
      setSaving(false);
    }
  };

  const [iosPicker, setIosPicker] = useState(false);
  const minuteToDate = (m: number) => new Date(2000, 0, 1, Math.floor(m / 60), m % 60);
  const dateToMinute = (d: Date) => d.getHours() * 60 + d.getMinutes();

  // The phone's own clock picker, for a time that isn't on the wheel's 15-minute steps.
  const openTimePicker = () => {
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: minuteToDate(startMinute),
        mode: 'time',
        onChange: (event, date) => {
          if (event.type === 'set' && date) setStartMinute(dateToMinute(date));
        },
      });
    } else if (Platform.OS === 'ios') {
      setIosPicker((v) => !v);
    }
  };

  const archive = async () => {
    if (!existing) return;
    await archiveHabit(existing.id, true);
    closeModal();
  };

  const remove = async () => {
    if (!existing) return;
    const ok = await confirmDestructive(
      `Delete "${existing.name}"?`,
      'Its streak and check-in history will be deleted too. Archive it instead to keep them.',
      'Delete',
    );
    if (!ok) return;
    await removeHabit(existing.id);
    closeModal();
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardLift style={styles.flex}>
        <View style={styles.topBar}>
          <Pressable onPress={() => closeModal()} hitSlop={12}>
            <Text style={styles.topAction}>Cancel</Text>
          </Pressable>
          <Text style={styles.topTitle}>
            {existing ? 'Edit habit' : quick ? 'New task' : 'New habit'}
          </Text>
          {quick ? (
            <Text style={styles.topAction}>
              {QUICK_STEPS.indexOf(step) + 1} of {QUICK_STEPS.length}
            </Text>
          ) : (
            <Pressable onPress={save} disabled={saving} hitSlop={12}>
              <Text style={[styles.topAction, styles.topSave]}>Save</Text>
            </Pressable>
          )}
        </View>

        {quick ? (
          <>
            <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
              {otherDay && (
                <View style={styles.dayBanner}>
                  <Ionicons name="calendar-outline" size={16} color={colors.accentLight} />
                  <Text style={styles.dayBannerText}>Adding to {dayLabel}</Text>
                </View>
              )}

              {step === 'what' && (
                <View style={styles.field}>
                  <Text style={styles.question}>What do you want to do?</Text>
                  <View style={styles.nameRow}>
                    <View style={styles.nameIcon}>
                      <Ionicons name={icon} size={22} color={colors.accent} />
                    </View>
                    <TextInput
                      value={name}
                      onChangeText={changeName}
                      placeholder="e.g. Read 20 pages"
                      placeholderTextColor={colors.iconMuted}
                      style={[styles.input, styles.flex, error && styles.inputError]}
                      autoFocus
                      maxLength={40}
                      returnKeyType="next"
                      onSubmitEditing={nextStep}
                    />
                  </View>
                  {error && <Text style={styles.error}>{error}</Text>}
                </View>
              )}

              {step === 'when' && (
                <>
                  <View style={styles.field}>
                    <Text style={styles.question}>When?</Text>
                    <Segmented options={TIME_OPTIONS} value={timeMode} onChange={setTimeMode} />
                    {timeMode === 'timed' ? (
                      <>
                        <TimeWheel value={startMinute} onChange={setStartMinute} />
                        {Platform.OS !== 'web' && (
                          <Pressable onPress={openTimePicker} hitSlop={8} accessibilityRole="button">
                            <Text style={styles.exactLink}>Pick an exact time</Text>
                          </Pressable>
                        )}
                        {iosPicker && Platform.OS === 'ios' && (
                          <DateTimePicker
                            value={minuteToDate(startMinute)}
                            mode="time"
                            display="spinner"
                            themeVariant="dark"
                            onChange={(_, date) => date && setStartMinute(dateToMinute(date))}
                          />
                        )}
                      </>
                    ) : (
                      <Text style={styles.helper}>
                        No fixed time. Plan my day can find a slot for it.
                      </Text>
                    )}
                  </View>
                  <View style={styles.field}>
                    <Text style={styles.label}>How often</Text>
                    <Segmented options={REPEAT_OPTIONS} value={repeat} onChange={setRepeat} />
                    {repeat === 'days' && (
                      <View style={styles.weekdays}>
                        {WEEKDAYS.map(([wd, letter, full]) => {
                          const on = days.includes(wd);
                          return (
                            <Pressable
                              key={wd}
                              onPress={() => {
                                setDays((prev) =>
                                  on ? prev.filter((d) => d !== wd) : [...prev, wd],
                                );
                                setDaysError(false);
                              }}
                              style={[styles.weekday, on && styles.weekdayOn]}
                              accessibilityRole="checkbox"
                              accessibilityState={{ checked: on }}
                              accessibilityLabel={full}
                            >
                              <Text style={[styles.weekdayText, on && styles.weekdayTextOn]}>
                                {letter}
                              </Text>
                            </Pressable>
                          );
                        })}
                      </View>
                    )}
                    {repeat === 'days' && daysError && (
                      <Text style={styles.error}>Pick at least one day</Text>
                    )}
                  </View>
                </>
              )}

              {step === 'minutes' && timeMode === 'timed' && (
                <View style={styles.field}>
                  <Text style={styles.question}>Until when?</Text>
                  <TimeWheel value={endMinute} onChange={setEnd} label="End time" />
                  <Text style={styles.helper}>
                    {formatMinute(startMinute)} – {formatMinute(endMinute)} ·{' '}
                    {formatDuration(durationMin)}
                    {repeat === 'once' ? ` · ${dayLabel}` : repeat === 'daily' ? ' · every day' : ''}
                  </Text>
                  {error && <Text style={styles.error}>{error}</Text>}
                </View>
              )}

              {step === 'minutes' && timeMode !== 'timed' && (
                <View style={styles.field}>
                  <Text style={styles.question}>About how long?</Text>
                  <View style={styles.chips}>
                    {QUICK_MINUTES.map((m) => {
                      const on = m === durationMin && customMinutes === '';
                      return (
                        <Pressable
                          key={m}
                          onPress={() => {
                            setDurationMin(m);
                            setCustomMinutes('');
                          }}
                          style={[styles.chip, on && styles.chipOn]}
                          accessibilityRole="radio"
                          accessibilityState={{ selected: on }}
                        >
                          <Text style={[styles.chipText, on && styles.chipTextOn]}>
                            {formatDuration(m)}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                  <TextInput
                    value={customMinutes}
                    onChangeText={(t) => {
                      const clean = t.replace(/[^0-9]/g, '');
                      setCustomMinutes(clean);
                      const m = Number(clean);
                      if (m >= 1 && m <= 720) setDurationMin(m);
                    }}
                    placeholder="Other: type minutes"
                    placeholderTextColor={colors.iconMuted}
                    keyboardType="number-pad"
                    style={styles.input}
                    maxLength={3}
                  />
                  <Text style={styles.helper}>
                    {`About ${formatDuration(durationMin)}, any time`}
                    {repeat === 'once' ? ` · ${dayLabel}` : repeat === 'daily' ? ' · every day' : ''}
                  </Text>
                  {error && <Text style={styles.error}>{error}</Text>}
                </View>
              )}

              <Pressable onPress={() => setStep('full')} hitSlop={8} style={styles.moreLink}>
                <Text style={styles.moreText}>More options (worth, count goals, icon)</Text>
              </Pressable>
            </ScrollView>

            <View style={styles.footer}>
              {step !== 'what' && (
                <Pressable
                  onPress={() => setStep(step === 'minutes' ? 'when' : 'what')}
                  style={styles.backButton}
                  accessibilityRole="button"
                >
                  <Text style={styles.backText}>Back</Text>
                </Pressable>
              )}
              <Pressable
                onPress={() => {
                  if (step !== 'minutes') nextStep();
                  else if (Date.now() - lastStepAt.current >= 400) save();
                }}
                disabled={saving}
                style={[styles.nextButton, saving && styles.disabled]}
                accessibilityRole="button"
              >
                <Text style={styles.nextText}>{step === 'minutes' ? 'Add task' : 'Next'}</Text>
              </Pressable>
            </View>
          </>
        ) : (
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {otherDay && (
            <View style={styles.dayBanner}>
              <Ionicons name="calendar-outline" size={16} color={colors.accentLight} />
              <Text style={styles.dayBannerText}>Adding to {dayLabel}</Text>
            </View>
          )}
          <View style={styles.field}>
            <Text style={styles.label}>Name</Text>
            <TextInput
              value={name}
              onChangeText={changeName}
              placeholder="Read 20 pages"
              placeholderTextColor={colors.iconMuted}
              style={[styles.input, error && styles.inputError]}
              autoFocus={!existing}
              maxLength={40}
              returnKeyType="done"
              onSubmitEditing={save}
            />
            {error && <Text style={styles.error}>{error}</Text>}
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Icon</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator
              persistentScrollbar
              contentContainerStyle={styles.iconRow}
            >
              {HABIT_ICONS.map((name) => {
                const selected = name === icon;
                return (
                  <Pressable
                    key={name}
                    onPress={() => {
                      setIcon(name);
                      setIconPicked(true);
                    }}
                    style={[styles.iconCell, selected && styles.iconCellSelected]}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    accessibilityLabel={name.replace(/-outline$/, '').replace(/-/g, ' ')}
                  >
                    <Ionicons
                      name={name}
                      size={22}
                      color={selected ? colors.onAccent : colors.text}
                    />
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Repeat</Text>
            <Segmented options={REPEAT_OPTIONS} value={repeat} onChange={setRepeat} />
            {repeat === 'days' && (
              <View style={styles.weekdays}>
                {WEEKDAYS.map(([wd, letter, full]) => {
                  const on = days.includes(wd);
                  return (
                    <Pressable
                      key={wd}
                      onPress={() => {
                        setDays((prev) => (on ? prev.filter((d) => d !== wd) : [...prev, wd]));
                        setDaysError(false);
                      }}
                      style={[styles.weekday, on && styles.weekdayOn]}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: on }}
                      accessibilityLabel={full}
                    >
                      <Text style={[styles.weekdayText, on && styles.weekdayTextOn]}>{letter}</Text>
                    </Pressable>
                  );
                })}
              </View>
            )}
            {repeat === 'days' && daysError && (
              <Text style={styles.error}>Pick at least one day</Text>
            )}
            {repeat === 'once' && (
              <Text style={styles.helper}>
                A one-off task for {dayLabel}. It won’t count toward streaks.
              </Text>
            )}
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Time</Text>
            <Segmented options={TIME_OPTIONS} value={timeMode} onChange={setTimeMode} />
            {timeMode === 'timed' && (
              <>
                <TimeWheel value={startMinute} onChange={setStartMinute} />
                {Platform.OS !== 'web' && (
                  <Pressable onPress={openTimePicker} hitSlop={8} accessibilityRole="button">
                    <Text style={styles.exactLink}>Pick an exact time</Text>
                  </Pressable>
                )}
                {iosPicker && Platform.OS === 'ios' && (
                  <DateTimePicker
                    value={minuteToDate(startMinute)}
                    mode="time"
                    display="spinner"
                    themeVariant="dark"
                    onChange={(_, date) => date && setStartMinute(dateToMinute(date))}
                  />
                )}
                <Text style={styles.timeLabel}>Ends</Text>
                <TimeWheel value={endMinute} onChange={setEnd} label="End time" />
                <Text style={styles.helper}>
                  {formatMinute(startMinute)} – {formatMinute(endMinute)} · {formatDuration(durationMin)}
                </Text>
              </>
            )}
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Worth</Text>
            <Segmented options={WORTH_OPTIONS} value={worth} onChange={setWorth} />
            <Text style={styles.helper}>
              Points toward your daily %. A high-worth habit counts three times a low one.
            </Text>
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Goal</Text>
            <Segmented options={GOAL_OPTIONS} value={kind} onChange={setKind} />

            {kind === 'count' && (
              <View style={styles.countRow}>
                <View style={styles.stepper}>
                  <Pressable
                    onPress={() => setTarget((t) => Math.max(2, t - 1))}
                    style={styles.stepButton}
                    accessibilityLabel="Decrease goal"
                  >
                    <Ionicons name="remove" size={20} color={colors.text} />
                  </Pressable>
                  <Text style={styles.stepValue}>{target}</Text>
                  <Pressable
                    onPress={() => setTarget((t) => Math.min(MAX_TARGET, t + 1))}
                    style={styles.stepButton}
                    accessibilityLabel="Increase goal"
                  >
                    <Ionicons name="add" size={20} color={colors.text} />
                  </Pressable>
                </View>
                <TextInput
                  value={unit}
                  onChangeText={setUnit}
                  placeholder="glasses"
                  placeholderTextColor={colors.iconMuted}
                  style={[styles.input, styles.unitInput]}
                  maxLength={16}
                />
              </View>
            )}
          </View>

          {existing && (
            <Pressable onPress={archive} style={styles.archiveButton}>
              <Ionicons name="archive-outline" size={18} color={colors.text} />
              <Text style={styles.archiveText}>Archive (keeps history)</Text>
            </Pressable>
          )}
          {existing && (
            <Pressable onPress={remove} style={styles.deleteButton}>
              <Ionicons name="trash-outline" size={18} color={colors.danger} />
              <Text style={styles.deleteText}>Delete habit</Text>
            </Pressable>
          )}
        </ScrollView>
        )}
      </KeyboardLift>
    </SafeAreaView>
  );
}

const styles = themedStyles(() => ({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  flex: {
    flex: 1,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg + 4,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  topTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '600',
  },
  topAction: {
    color: colors.textMuted,
    fontSize: 16,
  },
  topSave: {
    color: colors.accent,
    fontWeight: '600',
  },
  content: {
    padding: spacing.lg + 4,
    gap: spacing.xl,
  },
  field: {
    gap: spacing.sm,
  },
  label: {
    color: colors.textMuted,
    fontSize: 13,
  },
  input: {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: 'transparent',
    color: colors.text,
    fontSize: 16,
    paddingHorizontal: spacing.md + 2,
    paddingVertical: spacing.md,
  },
  inputError: {
    borderColor: colors.danger,
  },
  error: {
    color: colors.danger,
    fontSize: 13,
  },
  iconRow: {
    gap: spacing.sm,
    paddingBottom: spacing.sm,
  },
  iconCell: {
    width: 52,
    height: 52,
    borderRadius: radius.card,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconCellSelected: {
    backgroundColor: colors.accent,
  },
  weekdays: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.xs,
  },
  weekday: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  weekdayOn: {
    backgroundColor: colors.accent,
  },
  weekdayText: {
    color: colors.textMuted,
    fontSize: 14,
    fontWeight: '600',
  },
  weekdayTextOn: {
    color: colors.onAccent,
  },
  helper: {
    color: colors.textMuted,
    fontSize: 13,
  },
  countRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: radius.card,
  },
  dayBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.accentDark,
    borderRadius: radius.card,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
  },
  dayBannerText: {
    color: colors.accentLight,
    fontSize: 14,
    fontWeight: '500',
  },
  notFound: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  notFoundTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '600',
  },
  notFoundLink: {
    color: colors.accent,
    fontSize: 16,
    fontWeight: '600',
    marginTop: spacing.sm,
  },
  archiveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md + 2,
    borderRadius: radius.card,
    backgroundColor: colors.card,
    marginTop: spacing.sm,
  },
  archiveText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '500',
  },
  exactLink: {
    color: colors.textMuted,
    fontSize: 13,
    textAlign: 'center',
    textDecorationLine: 'underline',
  },
  timeLabel: {
    flex: 1,
    color: colors.text,
    fontSize: 15,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  chip: {
    backgroundColor: colors.card,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md + 2,
    paddingVertical: spacing.sm,
  },
  chipOn: {
    backgroundColor: colors.accent,
  },
  chipText: {
    color: colors.textMuted,
    fontSize: 14,
    fontWeight: '500',
  },
  chipTextOn: {
    color: colors.onAccent,
  },
  stepButton: {
    width: 44,
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepValue: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '600',
    minWidth: 28,
    textAlign: 'center',
  },
  unitInput: {
    flex: 1,
  },
  deleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md + 2,
    borderRadius: radius.card,
    backgroundColor: colors.dangerBg,
    marginTop: spacing.sm,
  },
  deleteText: {
    color: colors.danger,
    fontSize: 16,
    fontWeight: '500',
  },
  question: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '700',
    marginBottom: spacing.xs,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  nameIcon: {
    width: 48,
    height: 48,
    borderRadius: radius.pill,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  moreLink: {
    alignSelf: 'center',
  },
  moreText: {
    color: colors.textMuted,
    fontSize: 13,
    textDecorationLine: 'underline',
  },
  footer: {
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.lg + 4,
    paddingTop: spacing.sm,
  },
  backButton: {
    paddingVertical: spacing.md + 2,
    paddingHorizontal: spacing.xl,
    borderRadius: radius.pill,
    backgroundColor: colors.card,
  },
  backText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '500',
  },
  nextButton: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.md + 2,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
  },
  nextText: {
    color: colors.onAccent,
    fontSize: 16,
    fontWeight: '600',
  },
  disabled: {
    opacity: 0.5,
  },
}));
