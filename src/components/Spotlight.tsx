import { ComponentRef, RefObject, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Pet } from '@/components/Pet';
import { colors, radius, spacing, themedStyles } from '@/theme';

export type SpotlightTarget = RefObject<ComponentRef<typeof View> | null>;
type Rect = { x: number; y: number; width: number; height: number };

const PADDING = 6;
const TOP_MARGIN = 70;
const CARD_ROOM = 150;

// One step of a hands-on walkthrough: dims the screen except for the real control, which
// still works, with the pet explaining what to do. Goes inside the screen, not a Modal,
// so taps reach the control. With no target it's just a message in the middle.
export function Spotlight({
  stepKey,
  target,
  title,
  body,
  nextLabel,
  onNext,
  onSkip,
  refreshKey,
  scrollBy,
}: {
  // Changes with each step, so the highlight moves on.
  stepKey: string;
  target?: SpotlightTarget;
  title: string;
  body: string;
  // Leave out when the step moves on by itself once the person does the thing.
  nextLabel?: string;
  onNext?: () => void;
  onSkip?: () => void;
  // Changes when the screen's layout does, so the highlight stays on target.
  refreshKey?: number;
  scrollBy?: (dy: number) => void;
}) {
  const root = useRef<ComponentRef<typeof View>>(null);
  const [rect, setRect] = useState<Rect | null>(null);
  const [height, setHeight] = useState(0);
  const [shownKey, setShownKey] = useState(stepKey);
  if (shownKey !== stepKey) {
    setShownKey(stepKey);
    setRect(null);
  }

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    // Layout can still be settling (a form closing, a new row), so look again a few times.
    let scrollsLeft = 3;
    let lastTop: number | null = null;
    const measure = () => {
      root.current?.measureInWindow((_rx, ry, _rw, rh) => {
        setHeight(rh);
        const el = target?.current;
        if (!el) return;
        el.measureInWindow((x, y, width, h) => {
          if (!width && !h) return;
          const top = y - ry;
          // Bring it into view, leaving room for the card.
          // Aim for clear room the first time; after that only fix it being off screen, since
          // near the ends of the list it can't move any further.
          const outside =
            lastTop === null
              ? top < TOP_MARGIN || top + h > rh - CARD_ROOM
              : top < 0 || top + h > rh;
          if (scrollBy && outside && scrollsLeft > 0 && top !== lastTop) {
            scrollsLeft--;
            lastTop = top;
            scrollBy(top - TOP_MARGIN);
            timer = setTimeout(measure, 300);
            return;
          }
          setRect({
            x: x - PADDING,
            width: width + PADDING * 2,
            y: top - PADDING,
            height: h + PADDING * 2,
          });
        });
      });
    };
    // Lets a closing form or a new row settle first.
    timer = setTimeout(measure, 350);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepKey, refreshKey]);

  const block = { onStartShouldSetResponder: () => true };
  const below = rect ? height - (rect.y + rect.height) : 0;
  const cardPlace = !rect
    ? styles.cardCentre
    : below >= CARD_ROOM
      ? { top: rect.y + rect.height + spacing.md }
      : rect.y >= CARD_ROOM
        ? { bottom: Math.max(spacing.md, height - rect.y + spacing.md) }
        : { bottom: spacing.md };

  return (
    <View ref={root} collapsable={false} style={styles.root}>
      {rect ? (
        <>
          <View {...block} style={[styles.dim, { top: 0, left: 0, right: 0, height: rect.y }]} />
          <View
            {...block}
            style={[styles.dim, { top: rect.y + rect.height, left: 0, right: 0, bottom: 0 }]}
          />
          <View
            {...block}
            style={[styles.dim, { top: rect.y, height: rect.height, left: 0, width: rect.x }]}
          />
          <View
            {...block}
            style={[
              styles.dim,
              { top: rect.y, height: rect.height, left: rect.x + rect.width, right: 0 },
            ]}
          />
          <View
            style={[
              styles.ring,
              { top: rect.y, left: rect.x, width: rect.width, height: rect.height },
            ]}
          />
        </>
      ) : (
        <View {...block} style={[styles.dim, StyleSheet.absoluteFill]} />
      )}

      <View style={[styles.card, cardPlace]}>
        <View style={styles.pet}>
          <Pet mood="happy" />
        </View>
        <View style={styles.cardBody}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.body}>{body}</Text>
          <View style={styles.buttons}>
            {onSkip && (
              <Pressable onPress={onSkip} hitSlop={8} accessibilityRole="button">
                <Text style={styles.skip}>Skip guide</Text>
              </Pressable>
            )}
            {onNext && (
              <Pressable onPress={onNext} style={styles.next} accessibilityRole="button">
                <Text style={styles.nextText}>{nextLabel ?? 'Next'}</Text>
              </Pressable>
            )}
          </View>
        </View>
      </View>
    </View>
  );
}

const DIM = 'rgba(0,0,0,0.72)';

const styles = themedStyles(() => ({
  root: {
    ...StyleSheet.absoluteFill,
    zIndex: 100,
    pointerEvents: 'box-none',
  },
  dim: {
    position: 'absolute',
    backgroundColor: DIM,
  },
  ring: {
    position: 'absolute',
    borderWidth: 2,
    borderColor: colors.accent,
    borderRadius: radius.card,
    pointerEvents: 'none',
  },
  card: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    flexDirection: 'row',
    gap: spacing.xs,
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: radius.card,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
  },
  pet: {
    transform: [{ scale: 0.6 }],
    marginHorizontal: -spacing.md,
    marginVertical: -spacing.lg,
  },
  cardCentre: {
    top: '32%',
  },
  cardBody: {
    flex: 1,
    gap: 2,
  },
  title: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
  },
  body: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
  },
  buttons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: spacing.lg,
    marginTop: spacing.xs,
  },
  skip: {
    color: colors.textMuted,
    fontSize: 14,
  },
  next: {
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
    paddingVertical: spacing.xs + 2,
    paddingHorizontal: spacing.md,
  },
  nextText: {
    color: colors.onAccent,
    fontSize: 14,
    fontWeight: '600',
  },
}));
