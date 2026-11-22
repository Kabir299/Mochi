import { ComponentRef, useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ActionSheet, SheetAction } from '@/components/ActionSheet';
import { Confetti } from '@/components/Confetti';
import { UndoToast } from '@/components/UndoToast';
import { DayPicker } from '@/components/DayPicker';
import { HabitRow } from '@/components/HabitRow';
import { MonthCalendar } from '@/components/MonthCalendar';
import { Pet } from '@/components/Pet';
import { Segmented } from '@/components/Segmented';
import { Spotlight } from '@/components/Spotlight';
import { Timeline } from '@/components/Timeline';
import { WeekGrid } from '@/components/WeekGrid';
import { confirmAction, confirmDestructive } from '@/lib/confirm';
import {
  addDays,
  DateKey,
  formatDuration,
  formatLongDate,
  formatMinute,
  fromDateKey,
  toDateKey,
} from '@/lib/dates';
import { DayCheck } from '@/components/DayCheck';
import { cheer } from '@/lib/encouragement';
import { useToday } from '@/lib/useToday';
import { STARTER_HABITS } from '@/lib/starter';
import { computeDayStreak, streakProgress } from '@/lib/streak';
import { Habit, useHabits } from '@/state/habits';
import { useSettings } from '@/state/settings';
import { TIERS } from '@/lib/league';
import { useChallenges } from '@/state/useChallenges';
import { useLeague } from '@/state/useLeague';
import { useRestoreBackup } from '@/state/useRestoreBackup';
import { colors, radius, spacing, themedStyles } from '@/theme';

const openNewHabit = (day?: DateKey) =>
  router.push(day ? { pathname: '/habit-form', params: { day } } : '/habit-form');
const openEdit = (habit: Habit) =>
  router.push({ pathname: '/habit-form', params: { id: String(habit.id) } });

const VIEWS = [
  ['day', 'Day'],
  ['week', 'Week'],
] as const;
type ViewMode = (typeof VIEWS)[number][0];
type TourStep = 'add' | 'tick' | 'end';

const MILESTONES = [1, 3, 7, 30, 100, 365];
// Unfinished one-off tasks from this many days back are offered again today.
const LEFTOVER_DAYS = 7;

function dayTitle(day: DateKey, todayKey: DateKey) {
  const today = fromDateKey(todayKey);
  if (day === todayKey) return 'Today';
  if (day === toDateKey(addDays(today, -1))) return 'Yesterday';
  if (day === toDateKey(addDays(today, 1))) return 'Tomorrow';
  return fromDateKey(day).toLocaleDateString(undefined, { weekday: 'long' });
}

const minuteOfDay = (d: Date) => d.getHours() * 60 + d.getMinutes();

export default function TodayScreen() {
  const {
    loaded,
    habits,
    habitsOn,
    isScheduled,
    firstDay,
    countFor,
    isDone,
    habitProgress,
    dayProgress,
    streakFor,
    checkIn,
    setCountFor,
    decrement,
    increment,
    addHabit,
    entryFor,
    archiveHabit,
    removeHabit,
    moveOnceTask,
    moveHabit,
  } = useHabits();
  const settings = useSettings();
  const challenges = useChallenges();
  const league = useLeague();
  const restoreBackup = useRestoreBackup();

  const today = useToday();
  const todayKey = toDateKey(today);
  const [selected, setSelected] = useState<DateKey>(todayKey);
  // When the date rolls over while open, follow it if the old today was showing.
  const [shownToday, setShownToday] = useState(todayKey);
  if (shownToday !== todayKey) {
    setShownToday(todayKey);
    if (selected === shownToday) setSelected(todayKey);
  }
  const [view, setView] = useState<ViewMode>('day');
  const [menuHabit, setMenuHabit] = useState<Habit | null>(null);
  const [aiMenu, setAiMenu] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [celebrate, setCelebrate] = useState(false);
  const [undo, setUndo] = useState<{ message: string; run: () => void } | null>(null);
  const hideUndo = useCallback(() => setUndo(null), []);
  const [freezeSeen, setFreezeSeen] = useState(false);
  const isToday = selected === todayKey;
  const isFuture = selected > todayKey;
  const selectedDate = fromDateKey(selected);
  const thresholdPct = Math.round(settings.streakThreshold * 100);

  // Keeps the "now" marker moving while the screen is open.
  const [nowMinute, setNowMinute] = useState(minuteOfDay(new Date()));
  useEffect(() => {
    const timer = setInterval(() => setNowMinute(minuteOfDay(new Date())), 60_000);
    return () => clearInterval(timer);
  }, []);

  const dayHabits = habitsOn(selected);
  const timed = dayHabits.filter((h) => h.startMinute !== null);
  const anytime = dayHabits.filter((h) => h.startMinute === null);

  const doneCount = dayHabits.filter((h) => isDone(h, selected)).length;
  const percent = Math.round((dayProgress(selected) ?? 0) * 100);
  const dayStreak = computeDayStreak(
    firstDay,
    today,
    streakProgress(dayProgress, {
      repairedDays: settings.repairedDays,
      restDays: settings.restDays,
      threshold: settings.streakThreshold,
    }),
    settings.streakThreshold,
    settings.freezesPerMonth,
  );
  const met = percent >= thresholdPct;

  // Unfinished one-off tasks from the last week, offered again today.
  const leftovers = isToday
    ? habits.filter(
        (h) =>
          h.repeat === 'once' &&
          h.onceDay !== null &&
          h.onceDay < todayKey &&
          h.onceDay >= toDateKey(addDays(today, -LEFTOVER_DAYS)) &&
          !isDone(h, h.onceDay),
      )
    : [];

  const yesterdayKey = toDateKey(addDays(today, -1));
  const showFreezeNotice = isToday && !freezeSeen && dayStreak.frozenDays.has(yesterdayKey);

  // Confetti when today first reaches 100% while the screen is open.
  const lastPercent = useRef<number | null>(null);
  useEffect(() => {
    if (!isToday) {
      lastPercent.current = null;
      return;
    }
    if (lastPercent.current !== null && lastPercent.current < 100 && percent === 100) {
      setCelebrate(true);
    }
    lastPercent.current = percent;
  }, [percent, isToday]);

  // Planned time is the timed habits' durations. Time done uses focus-timer
  // minutes when recorded, otherwise partial progress (4 of 8 on 1h is 30m).
  const plannedMin = timed.reduce((s, h) => s + (h.durationMin ?? 0), 0);
  const doneMin = timed.reduce((s, h) => {
    const spent = entryFor(h.id, selected).spentMin;
    return s + (spent > 0 ? spent : (h.durationMin ?? 0) * habitProgress(h, selected));
  }, 0);
  const timePercent = plannedMin ? Math.min(100, Math.round((doneMin / plannedMin) * 100)) : 0;

  const milestone =
    isToday && met && MILESTONES.includes(dayStreak.current) ? dayStreak.current : null;
  const mood = cheer({
    percent,
    isToday,
    isFuture,
    nowMinute,
    timed,
    isDone: (h) => isDone(h, selected),
    firstDay: dayHabits.length > 0 && dayHabits.every((h) => h.startDay === selected),
  });
  // The first days matter most for sticking with it, so they get their own cheers.
  const message =
    milestone === 1
      ? `Day one done! ${settings.petName} believes in you. Same time tomorrow?`
      : milestone === 3
        ? `3 days in a row! This is where habits start to stick.`
        : milestone
          ? `${milestone}-day streak! ${settings.petName} is so proud of you.`
          : mood.message;

  // Confetti the moment a streak milestone is reached.
  const lastMilestone = useRef<number | null>(milestone);
  useEffect(() => {
    // Looking at other days shouldn't reset it, or coming back would celebrate again.
    if (!isToday) return;
    if (milestone !== null && lastMilestone.current === null) setCelebrate(true);
    lastMilestone.current = milestone;
  }, [milestone, isToday]);

  // Ticking off a future day asks first, so it isn't done by accident.
  const handleCheck = async (habit: Habit, day: DateKey) => {
    if (day > todayKey && countFor(habit.id, day) === 0) {
      const ok = await confirmAction(
        'Done early?',
        `Mark "${habit.name}" as done for ${dayTitle(day, todayKey).toLowerCase()}?`,
        'Mark done',
      );
      if (!ok) return;
    }
    const before = countFor(habit.id, day);
    checkIn(habit, day);
    const after = before >= habit.target ? 0 : before + 1;
    setUndo({
      message:
        after >= habit.target
          ? `Done: ${habit.name}`
          : after === 0
            ? `Unchecked ${habit.name}`
            : `${habit.name}: ${after} of ${habit.target}`,
      run: () => setCountFor(habit, day, before),
    });
  };

  const menuActions = (habit: Habit): SheetAction[] => {
    const params = { id: String(habit.id), day: selected };
    const list: SheetAction[] = [
      { icon: 'create-outline', label: 'Edit', onPress: () => openEdit(habit) },
      {
        icon: 'chatbubble-ellipses-outline',
        label: 'Note and mood',
        onPress: () => router.push({ pathname: '/note', params }),
      },
      {
        icon: 'timer-outline',
        label: 'Start focus timer',
        onPress: () => router.push({ pathname: '/focus', params }),
      },
    ];
    if (habit.repeat === 'once') {
      const target = selected < todayKey ? todayKey : toDateKey(addDays(selectedDate, 1));
      list.push({
        icon: 'arrow-forward-circle-outline',
        label: target === todayKey ? 'Move to today' : 'Move to the next day',
        onPress: () => moveOnceTask(habit.id, target),
      });
    }
    if (habit.startMinute === null && anytime.length > 1) {
      list.push(
        { icon: 'arrow-up', label: 'Move up', onPress: () => moveHabit(habit.id, -1, anytime) },
        { icon: 'arrow-down', label: 'Move down', onPress: () => moveHabit(habit.id, 1, anytime) },
      );
    }
    list.push(
      {
        icon: 'archive-outline',
        label: 'Archive (keeps history)',
        onPress: () => archiveHabit(habit.id, true),
      },
      {
        icon: 'trash-outline',
        label: 'Delete',
        destructive: true,
        onPress: async () => {
          const ok = await confirmDestructive(
            `Delete "${habit.name}"?`,
            'Its streak and history will be deleted too. Archive it instead to keep them.',
            'Delete',
          );
          if (ok) await removeHabit(habit.id);
        },
      },
    );
    return list;
  };

  const aiActions: SheetAction[] = [
    {
      icon: 'analytics-outline',
      label: 'AI analysis',
      onPress: () => router.push('/ai-analysis'),
    },
    {
      icon: 'chatbubbles-outline',
      label: 'Chat with your coach',
      onPress: () => router.push('/coach'),
    },
    {
      icon: 'calendar-outline',
      label: 'Plan my day',
      onPress: () => router.push({ pathname: '/plan-day', params: { day: selected } }),
    },
  ];

  // The first-run walkthrough has the person do each thing for real. Steps move on by
  // watching for the result: a new task, a check-in, the menu opening.
  const tourOn = loaded && settings.loaded && !settings.guideSeen;
  const [tourStep, setTourStep] = useState<TourStep>('add');
  // Highest task id when the tour began, to spot the one they add, and that task.
  const [tourBase, setTourBase] = useState<number | null>(null);
  const [tourHabit, setTourHabit] = useState<number | null>(null);
  const [layoutTick, setLayoutTick] = useState(0);
  const addRef = useRef<ComponentRef<typeof View>>(null);
  const rowRef = useRef<ComponentRef<typeof View>>(null);
  const scroller = useRef<ComponentRef<typeof ScrollView>>(null);
  const scrollY = useRef(0);

  if (!tourOn) {
    if (tourBase !== null) {
      setTourBase(null);
      setTourStep('add');
      setTourHabit(null);
    }
  } else if (tourBase === null) {
    setTourBase(habits.reduce((max, h) => Math.max(max, h.id), 0));
    setSelected(todayKey);
    setView('day');
  } else if (tourStep === 'add') {
    if (habits.some((h) => h.id > tourBase)) {
      const added = dayHabits.filter((h) => h.id > tourBase).pop();
      setTourHabit(added?.id ?? null);
      setTourStep(added ? 'tick' : 'end');
    }
  } else if (tourStep === 'tick') {
    if (tourHabit === null || countFor(tourHabit, selected) > 0) setTourStep('end');
  }

  const finishTour = () => settings.update({ guideSeen: true });
  const tour = {
    add: {
      title: 'Add a task',
      body: 'Tap +. I’ve filled it in, so just tap through.',
    },
    tick: {
      title: 'Now tick it off',
      body: 'Tap the circle on your task.',
    },
    end: {
      title: 'You’re all set!',
      body: `Finish ${thresholdPct}% of your day to keep your streak. ⋮ on a task opens the focus timer, ✨ plans your day.`,
      nextLabel: 'Got it',
      onNext: finishTour,
    },
  }[tourStep];

  const row = (habit: Habit, minHeight?: number, variant?: 'card' | 'timeline') => {
    const entry = entryFor(habit.id, selected);
    return (
      <HabitRow
        key={habit.id}
        rootRef={tourOn && habit.id === tourHabit ? rowRef : undefined}
        habit={habit}
        count={countFor(habit.id, selected)}
        streak={streakFor(habit, isFuture ? today : selectedDate)}
        onCheckIn={() => handleCheck(habit, selected)}
        onDecrement={() => decrement(habit, selected)}
        onIncrement={() => increment(habit, selected)}
        onMenu={() => setMenuHabit(habit)}
        hasNote={Boolean(entry.note || entry.mood)}
        subtitle={
          habit.startMinute !== null && habit.durationMin
            ? `${formatMinute(habit.startMinute)} – ${formatMinute((habit.startMinute + habit.durationMin) % 1440)}`
            : undefined
        }
        variant={variant}
        style={minHeight ? { minHeight } : undefined}
      />
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        ref={scroller}
        contentContainerStyle={styles.content}
        scrollEventThrottle={32}
        onScroll={(e) => {
          scrollY.current = e.nativeEvent.contentOffset.y;
        }}
        onContentSizeChange={() => tourOn && setLayoutTick((n) => n + 1)}
      >
        <View style={styles.header}>
          <View style={styles.headerText}>
            <Text style={styles.title}>{dayTitle(selected, todayKey)}</Text>
            <Text style={styles.date}>{formatLongDate(selectedDate)}</Text>
          </View>
          <View style={styles.headerActions}>
            <Pressable
              onPress={() => router.push('/league')}
              style={({ pressed }) => [styles.aiButton, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel="League and challenges"
            >
              <Ionicons name="trophy-outline" size={20} color={colors.streak} />
            </Pressable>
            <Pressable
              onPress={() => setCalendarOpen(true)}
              style={({ pressed }) => [styles.aiButton, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel="Open calendar"
            >
              <Ionicons name="calendar-outline" size={20} color={colors.text} />
            </Pressable>
            <Pressable
              collapsable={false}
              onPress={() => setAiMenu(true)}
              style={({ pressed }) => [styles.aiButton, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel="AI tools"
            >
              <Ionicons name="sparkles-outline" size={20} color={colors.accent} />
            </Pressable>
            <Pressable
              ref={addRef}
              collapsable={false}
              onPress={() => openNewHabit(selected)}
              style={({ pressed }) => [styles.addButton, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel="Add habit"
            >
              <Ionicons name="add" size={24} color={colors.onAccent} />
            </Pressable>
          </View>
        </View>

        <DayPicker
          today={today}
          selected={selected}
          onSelect={setSelected}
          isDayComplete={(day) => (dayProgress(day) ?? 0) >= settings.streakThreshold}
          isFrozen={(day) => dayStreak.frozenDays.has(day)}
        />

        <View style={styles.viewRow}>
          <View style={styles.viewToggle}>
            <Segmented options={VIEWS} value={view} onChange={setView} />
          </View>
          {!isToday && (
            <Pressable onPress={() => setSelected(todayKey)} style={styles.backChip}>
              <Ionicons name="return-down-back-outline" size={14} color={colors.accent} />
              <Text style={styles.backChipText}>Today</Text>
            </Pressable>
          )}
        </View>

        {isToday && league.ready && (
          <Pressable
            onPress={() => router.push('/league')}
            style={({ pressed }) => [styles.challengeStrip, pressed && styles.pressed]}
            accessibilityRole="button"
          >
            <View style={[styles.leagueDot, { backgroundColor: TIERS[league.tier].color }]}>
              <Ionicons name={TIERS[league.tier].icon} size={12} color="#1B1B22" />
            </View>
            <Text style={styles.challengeText} numberOfLines={1}>
              #{league.rank} in {TIERS[league.tier].name} · {league.youXp} XP this week
              {league.todayXp.total > 0 ? ` · +${league.todayXp.total} today` : ''}
            </Text>
            <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
          </Pressable>
        )}

        {isToday && challenges.active.length > 0 && (
          <Pressable
            onPress={() => router.push('/challenges')}
            style={({ pressed }) => [styles.challengeStrip, pressed && styles.pressed]}
            accessibilityRole="button"
          >
            <Ionicons name="trophy" size={16} color={colors.streak} />
            <Text style={styles.challengeText} numberOfLines={1}>
              {challenges.active
                .map((c) =>
                  c.kind === 'run'
                    ? `${c.title} ${c.doneDays.includes(todayKey) ? '✓' : `· day ${c.doneDays.length + 1}/${c.days}`}`
                    : `${c.title} · running`,
                )
                .join('   ')}
            </Text>
            <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
          </Pressable>
        )}

        {showFreezeNotice && (
          <Pressable onPress={() => setFreezeSeen(true)} style={styles.notice}>
            <Ionicons name="snow-outline" size={18} color={colors.water} />
            <Text style={styles.noticeText}>
              A streak freeze covered yesterday, so your {dayStreak.current}-day streak is safe.{' '}
              {dayStreak.freezesLeft} left this month.
            </Text>
            <Ionicons name="close" size={16} color={colors.textMuted} />
          </Pressable>
        )}

        {loaded && habits.length === 0 && (
          <View style={styles.empty}>
            <View style={styles.emptyIcon}>
              <Ionicons name="sparkles-outline" size={28} color={colors.accent} />
            </View>
            <Text style={styles.emptyTitle}>Start your first habit</Text>
            <Text style={styles.emptyBody}>
              Start with a simple day: wake up at 6, meditate, walk 10k steps, drink water and do
              something fun. Or build your own.
            </Text>
            <Pressable
              onPress={async () => {
                for (const habit of STARTER_HABITS) await addHabit(habit);
              }}
              style={({ pressed }) => [styles.emptyButton, pressed && styles.pressed]}
            >
              <Text style={styles.emptyButtonText}>Use starter set</Text>
            </Pressable>
            <Pressable onPress={() => router.push('/templates')} hitSlop={8}>
              <Text style={styles.emptyLink}>Browse templates</Text>
            </Pressable>
            <Pressable onPress={() => openNewHabit()} hitSlop={8}>
              <Text style={styles.emptyLink}>Create my own</Text>
            </Pressable>
            <Pressable onPress={restoreBackup} hitSlop={8}>
              <Text style={styles.emptyLink}>Restore a backup</Text>
            </Pressable>
          </View>
        )}

        {view === 'week' && habits.length > 0 && (
          <WeekGrid
            anchor={selectedDate}
            todayKey={todayKey}
            habits={habits}
            isScheduled={isScheduled}
            progressOf={habitProgress}
            dayProgress={dayProgress}
            onToggle={handleCheck}
            onSelectDay={(day) => {
              setSelected(day);
              setView('day');
            }}
          />
        )}

        {view === 'day' && leftovers.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Left over from earlier</Text>
            {leftovers.map((habit) => (
              <View key={habit.id} style={styles.leftover}>
                <Ionicons name={habit.icon} size={16} color={colors.textMuted} />
                <Text style={styles.leftoverName} numberOfLines={1}>
                  {habit.name}
                </Text>
                <Pressable
                  onPress={() => moveOnceTask(habit.id, todayKey)}
                  style={styles.leftoverButton}
                >
                  <Text style={styles.leftoverButtonText}>Move to today</Text>
                </Pressable>
                <Pressable
                  onPress={() => archiveHabit(habit.id, true)}
                  hitSlop={8}
                  accessibilityLabel={`Dismiss ${habit.name}`}
                >
                  <Ionicons name="close" size={18} color={colors.textMuted} />
                </Pressable>
              </View>
            ))}
          </View>
        )}

        {view === 'day' && loaded && habits.length > 0 && dayHabits.length === 0 && (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>Nothing scheduled</Text>
            <Text style={styles.emptyBody}>
              {isFuture ? 'Nothing planned for this day yet.' : 'A free day. Enjoy it.'}
            </Text>
          </View>
        )}

        {view === 'day' && dayHabits.length > 0 && (
          <>
            {isToday && <DayCheck today={today} />}
            <View style={styles.progressCard}>
              <View style={styles.petRow}>
                <Pressable
                  onPress={() =>
                    router.push({
                      pathname: '/pet',
                      params: {
                        best: String(dayStreak.best),
                        current: String(dayStreak.current),
                      },
                    })
                  }
                  style={styles.petCol}
                  accessibilityRole="button"
                  accessibilityLabel={`${settings.petName}'s wardrobe`}
                >
                  <Pet mood={milestone ? 'ecstatic' : mood.mood} streak={dayStreak.best} />
                  <Text style={styles.petName} numberOfLines={1}>
                    {settings.petName}
                  </Text>
                </Pressable>
                <View style={styles.bubble}>
                  <Text style={styles.bubbleText}>{message}</Text>
                </View>
              </View>
              <View style={styles.progressTop}>
                <View>
                  <Text style={styles.statLabel}>{isToday ? 'Today’s progress' : 'Progress'}</Text>
                  <Text style={styles.percent}>{`${percent}%`}</Text>
                </View>
                <View style={styles.streakBox}>
                  <Text style={styles.statLabel}>Day streak</Text>
                  <View style={styles.streakValueRow}>
                    <Ionicons name="flame-outline" size={20} color={colors.streak} />
                    <Text style={[styles.statValue, styles.streakValue]}>{dayStreak.current}</Text>
                  </View>
                  <View
                    style={styles.freezeRow}
                    accessibilityLabel={`${dayStreak.freezesLeft} streak freezes left this month`}
                  >
                    <Ionicons name="snow-outline" size={13} color={colors.water} />
                    <Text style={styles.freezeText}>{dayStreak.freezesLeft} left</Text>
                  </View>
                </View>
              </View>
              <View
                style={styles.progressTrack}
                accessibilityRole="progressbar"
                accessibilityValue={{ min: 0, max: 100, now: percent }}
              >
                <View style={[styles.progressFill, { width: `${percent}%` }]} />
                <View style={[styles.thresholdMark, { left: `${thresholdPct}%` }]} />
              </View>
              <Text style={styles.progressSub}>
                {isFuture && doneCount === 0
                  ? `${dayHabits.length} planned`
                  : `${doneCount} of ${dayHabits.length} complete · ${
                      met
                        ? 'streak kept'
                        : isToday || isFuture
                          ? `reach ${thresholdPct}% to keep your streak`
                          : `below ${thresholdPct}%`
                    }`}
              </Text>

              {plannedMin > 0 && (
                <View style={styles.timeBlock}>
                  <View style={styles.timeHeader}>
                    <Ionicons name="time-outline" size={15} color={colors.water} />
                    <Text style={styles.timeLabel}>Time</Text>
                    <Text style={styles.timeValue}>
                      {isFuture && doneMin === 0
                        ? `${formatDuration(plannedMin)} planned`
                        : `${formatDuration(doneMin)} of ${formatDuration(plannedMin)}`}
                    </Text>
                  </View>
                  <View
                    style={styles.timeTrack}
                    accessibilityRole="progressbar"
                    accessibilityLabel="Time spent on planned habits"
                    accessibilityValue={{ min: 0, max: 100, now: timePercent }}
                  >
                    <View style={[styles.timeFill, { width: `${timePercent}%` }]} />
                  </View>
                </View>
              )}
            </View>

            {anytime.length > 0 && (
              <View style={styles.section}>
                {timed.length > 0 && <Text style={styles.sectionTitle}>Any time</Text>}
                <View style={styles.list}>{anytime.map((h) => row(h))}</View>
              </View>
            )}

            {timed.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Schedule</Text>
                <Timeline
                  habits={timed}
                  isDone={(h) => isDone(h, selected)}
                  nowMinute={isToday ? nowMinute : null}
                  renderRow={(h, minHeight) => row(h, minHeight, 'timeline')}
                />
              </View>
            )}

            <Text style={styles.hint}>Tap to check in · ⋮ for notes, timer and more</Text>
          </>
        )}
      </ScrollView>

      {tourOn && !menuHabit && !aiMenu && (
        <Spotlight
          stepKey={tourStep}
          target={tourStep === 'add' ? addRef : tourStep === 'tick' ? rowRef : undefined}
          refreshKey={layoutTick}
          scrollBy={(dy) =>
            scroller.current?.scrollTo({ y: scrollY.current + dy, animated: false })
          }
          onSkip={tourStep === 'end' ? undefined : finishTour}
          {...tour}
        />
      )}
      <ActionSheet
        visible={menuHabit !== null}
        title={menuHabit?.name}
        actions={menuHabit ? menuActions(menuHabit) : []}
        onClose={() => setMenuHabit(null)}
      />
      <ActionSheet
        visible={aiMenu}
        title="AI tools"
        actions={aiActions}
        onClose={() => setAiMenu(false)}
      />
      {calendarOpen && (
        <MonthCalendar
          visible
          selected={selected}
          today={todayKey}
          dayStatus={(day) =>
            dayStreak.frozenDays.has(day)
              ? 'frozen'
              : (dayProgress(day) ?? 0) >= settings.streakThreshold
                ? 'met'
                : null
          }
          onSelect={setSelected}
          onClose={() => setCalendarOpen(false)}
        />
      )}
      {celebrate && <Confetti onDone={() => setCelebrate(false)} />}
      {undo && <UndoToast message={undo.message} onUndo={undo.run} onHide={hideUndo} />}
    </SafeAreaView>
  );
}

const styles = themedStyles(() => ({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.lg + 4,
    gap: spacing.lg,
  },
  leagueDot: {
    width: 20,
    height: 20,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  challengeStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.proBg,
    borderRadius: radius.card,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  challengeText: {
    flex: 1,
    color: colors.text,
    fontSize: 13,
    fontWeight: '600',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerText: {
    flex: 1,
  },
  title: {
    color: colors.text,
    fontSize: 32,
    fontWeight: '600',
  },
  date: {
    color: colors.textMuted,
    fontSize: 14,
    marginTop: 2,
  },
  headerActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  aiButton: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addButton: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.7,
  },
  backChip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 4,
    backgroundColor: colors.accentDark,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
  },
  backChipText: {
    color: colors.accentLight,
    fontSize: 13,
    fontWeight: '500',
  },
  viewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  viewToggle: {
    flex: 1,
  },
  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.waterDark,
    borderRadius: radius.card,
    padding: spacing.md,
  },
  noticeText: {
    flex: 1,
    color: colors.text,
    fontSize: 14,
    lineHeight: 19,
  },
  leftover: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.card,
    borderRadius: radius.card,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
  },
  leftoverName: {
    flex: 1,
    color: colors.text,
    fontSize: 15,
  },
  leftoverButton: {
    backgroundColor: colors.accentDark,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
  },
  leftoverButtonText: {
    color: colors.accentLight,
    fontSize: 13,
    fontWeight: '600',
  },
  petCol: {
    alignItems: 'center',
    gap: 4,
    width: 64,
  },
  petName: {
    color: colors.textMuted,
    fontSize: 11,
  },
  progressCard: {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    padding: spacing.lg,
    gap: spacing.md,
  },
  petRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  bubble: {
    flex: 1,
    backgroundColor: colors.border,
    borderRadius: radius.card,
    borderBottomLeftRadius: 4,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
  },
  bubbleText: {
    color: colors.text,
    fontSize: 14,
    lineHeight: 19,
  },
  progressTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  percent: {
    color: colors.text,
    fontSize: 40,
    fontWeight: '700',
    marginTop: 2,
  },
  streakBox: {
    alignItems: 'flex-end',
    gap: 2,
  },
  streakValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  streakValue: {
    color: colors.streak,
  },
  freezeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  freezeText: {
    color: colors.water,
    fontSize: 12,
  },
  statLabel: {
    color: colors.textMuted,
    fontSize: 13,
  },
  statValue: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '600',
  },
  progressTrack: {
    height: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.border,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
  },
  thresholdMark: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 2,
    marginLeft: -1,
    backgroundColor: colors.text,
    opacity: 0.5,
  },
  progressSub: {
    color: colors.textMuted,
    fontSize: 13,
  },
  timeBlock: {
    gap: 6,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  timeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  timeLabel: {
    flex: 1,
    color: colors.textMuted,
    fontSize: 13,
  },
  timeValue: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '600',
  },
  timeTrack: {
    height: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.border,
    overflow: 'hidden',
  },
  timeFill: {
    height: '100%',
    borderRadius: radius.pill,
    backgroundColor: colors.water,
  },
  section: {
    gap: spacing.sm,
  },
  sectionTitle: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '500',
  },
  list: {
    gap: spacing.sm + 2,
  },
  hint: {
    color: colors.iconMuted,
    fontSize: 12,
    textAlign: 'center',
  },
  empty: {
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: radius.card,
    padding: spacing.xl,
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  emptyIcon: {
    width: 56,
    height: 56,
    borderRadius: radius.pill,
    backgroundColor: colors.accentDark,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  emptyTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '600',
  },
  emptyBody: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  emptyButton: {
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    marginTop: spacing.md,
  },
  emptyLink: {
    color: colors.accent,
    fontSize: 15,
    fontWeight: '500',
    marginTop: spacing.sm,
  },
  emptyButtonText: {
    color: colors.onAccent,
    fontSize: 15,
    fontWeight: '600',
  },
}));
