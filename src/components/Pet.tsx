import { useEffect, useState } from 'react';
import { Animated, View } from 'react-native';

import type { Mood } from '@/lib/encouragement';
import { autoItem, colorFor, PetItem } from '@/lib/wardrobe';
import { useSettings } from '@/state/settings';
import { themedStyles } from '@/theme';

// Sad and sleepy moods fade the chosen colour so the mood still reads.
const MOOD_TINT: Partial<Record<Mood, string>> = {
  sad: '#8FA3B8',
  sleepy: '#9E9EB0',
};

// Grows a little with your best day streak.
function scaleFor(streak: number) {
  if (streak >= 100) return 1.15;
  if (streak >= 30) return 1.08;
  if (streak >= 7) return 1;
  return 0.88;
}

// A small blob friend drawn with plain views. It bounces when its mood changes.
// Colour and accessory come from the wardrobe; `preview` overrides them there.
export function Pet({
  mood,
  streak = 0,
  preview,
}: {
  mood: Mood;
  streak?: number;
  preview?: { color: string; item: string };
}) {
  const settings = useSettings();
  const chosenItem = (preview?.item ?? settings.petItem) as PetItem;
  const stage = {
    scale: scaleFor(streak),
    accessory: chosenItem === 'auto' ? autoItem(streak) : chosenItem,
  };
  const bodyColor = MOOD_TINT[mood] ?? colorFor(preview?.color ?? settings.petColor);
  const [bounce] = useState(() => new Animated.Value(1));

  useEffect(() => {
    Animated.sequence([
      Animated.spring(bounce, { toValue: 1.15, useNativeDriver: true, speed: 40 }),
      Animated.spring(bounce, { toValue: 1, useNativeDriver: true, friction: 3 }),
    ]).start();
  }, [mood, bounce]);

  const happy = mood === 'happy' || mood === 'ecstatic';

  return (
    <Animated.View
      style={[
        styles.body,
        {
          backgroundColor: bodyColor,
          transform: [{ scale: Animated.multiply(bounce, stage.scale) }],
        },
      ]}
      accessibilityLabel={`Your pet looks ${mood}`}
    >
      {stage.accessory === 'sprout' && (
        <View style={styles.sprout}>
          <View style={[styles.leaf, styles.leafLeft]} />
          <View style={[styles.leaf, styles.leafRight]} />
        </View>
      )}
      {stage.accessory === 'bow' && (
        <View style={styles.bow}>
          <View style={[styles.bowWing, styles.bowLeft]} />
          <View style={styles.bowKnot} />
          <View style={[styles.bowWing, styles.bowRight]} />
        </View>
      )}
      {stage.accessory === 'crown' && (
        <View style={styles.crown}>
          {[0, 1, 2].map((i) => (
            <View key={i} style={styles.crownPoint} />
          ))}
        </View>
      )}
      <View style={styles.eyes}>
        {[0, 1].map((i) =>
          mood === 'sleepy' ? (
            <View key={i} style={styles.eyeClosed} />
          ) : mood === 'ecstatic' ? (
            <View key={i} style={styles.eyeHappy} />
          ) : (
            <View key={i} style={[styles.eye, mood === 'sad' && styles.eyeSad]} />
          ),
        )}
      </View>
      {happy && (
        <View style={styles.cheeks}>
          <View style={styles.cheek} />
          <View style={styles.cheek} />
        </View>
      )}
      <View
        style={[
          styles.mouth,
          happy && styles.mouthSmile,
          mood === 'ecstatic' && styles.mouthBig,
          mood === 'sad' && styles.mouthSad,
          (mood === 'okay' || mood === 'sleepy') && styles.mouthFlat,
        ]}
      />
    </Animated.View>
  );
}

const INK = '#1A1A22';

const styles = themedStyles(() => ({
  sprout: {
    position: 'absolute',
    top: -9,
    flexDirection: 'row',
    gap: 1,
  },
  leaf: {
    width: 9,
    height: 6,
    backgroundColor: '#5DCA7A',
  },
  leafLeft: {
    borderTopLeftRadius: 6,
    borderBottomRightRadius: 6,
  },
  leafRight: {
    borderTopRightRadius: 6,
    borderBottomLeftRadius: 6,
  },
  bow: {
    position: 'absolute',
    top: -5,
    right: 6,
    flexDirection: 'row',
    alignItems: 'center',
  },
  bowWing: {
    width: 8,
    height: 9,
    backgroundColor: '#F4A0B5',
  },
  bowLeft: {
    borderTopLeftRadius: 5,
    borderBottomLeftRadius: 5,
  },
  bowRight: {
    borderTopRightRadius: 5,
    borderBottomRightRadius: 5,
  },
  bowKnot: {
    width: 4,
    height: 5,
    borderRadius: 2,
    backgroundColor: '#E07A98',
  },
  crown: {
    position: 'absolute',
    top: -9,
    flexDirection: 'row',
    gap: 2,
  },
  crownPoint: {
    width: 0,
    height: 0,
    borderLeftWidth: 5,
    borderRightWidth: 5,
    borderBottomWidth: 10,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: '#EF9F27',
  },
  body: {
    width: 56,
    height: 50,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderBottomLeftRadius: 18,
    borderBottomRightRadius: 18,
    alignItems: 'center',
    paddingTop: 14,
  },
  eyes: {
    flexDirection: 'row',
    gap: 14,
    height: 8,
    alignItems: 'center',
  },
  eye: {
    width: 7,
    height: 8,
    borderRadius: 4,
    backgroundColor: INK,
  },
  eyeSad: {
    height: 6,
    marginTop: 3,
  },
  eyeHappy: {
    width: 9,
    height: 5,
    borderTopLeftRadius: 5,
    borderTopRightRadius: 5,
    borderWidth: 2,
    borderBottomWidth: 0,
    borderColor: INK,
  },
  eyeClosed: {
    width: 9,
    height: 2,
    borderRadius: 1,
    backgroundColor: INK,
  },
  cheeks: {
    position: 'absolute',
    top: 25,
    flexDirection: 'row',
    gap: 26,
  },
  cheek: {
    width: 7,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#F4A0B5',
    opacity: 0.8,
  },
  mouth: {
    marginTop: 6,
  },
  mouthSmile: {
    width: 12,
    height: 6,
    borderBottomLeftRadius: 6,
    borderBottomRightRadius: 6,
    borderWidth: 2,
    borderTopWidth: 0,
    borderColor: INK,
  },
  mouthBig: {
    width: 14,
    height: 8,
    backgroundColor: INK,
  },
  mouthSad: {
    width: 12,
    height: 6,
    marginTop: 8,
    borderTopLeftRadius: 6,
    borderTopRightRadius: 6,
    borderWidth: 2,
    borderBottomWidth: 0,
    borderColor: INK,
  },
  mouthFlat: {
    width: 10,
    height: 2,
    marginTop: 8,
    borderRadius: 1,
    backgroundColor: INK,
  },
}));
