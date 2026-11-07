import { useEffect, useState } from 'react';
import { Animated, Dimensions, Easing, StyleSheet, View } from 'react-native';

import { colors } from '@/theme';

const PIECES = 36;
const DURATION = 2400;
const palette = () => [colors.accent, colors.streak, colors.water, colors.accentLight, '#F4A0B5'];

type Piece = { x: number; delay: number; spin: number; color: string; size: number };

function makePieces(width: number): Piece[] {
  return Array.from({ length: PIECES }, (_, i) => ({
    x: Math.random() * width,
    delay: Math.random() * 400,
    spin: (Math.random() - 0.5) * 6,
    color: palette()[i % 5],
    size: 6 + Math.random() * 6,
  }));
}

// Falling confetti over the whole screen. Doesn't block taps.
export function Confetti({ onDone }: { onDone: () => void }) {
  const { width, height } = Dimensions.get('window');
  const [pieces] = useState(() => makePieces(width));
  const [progress] = useState(() => pieces.map(() => new Animated.Value(0)));

  useEffect(() => {
    Animated.parallel(
      progress.map((value, i) =>
        Animated.timing(value, {
          toValue: 1,
          duration: DURATION,
          delay: pieces[i].delay,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true,
        }),
      ),
    ).start(onDone);
  }, [progress, pieces, onDone]);

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {pieces.map((piece, i) => (
        <Animated.View
          key={i}
          style={{
            position: 'absolute',
            left: piece.x,
            top: -20,
            width: piece.size,
            height: piece.size * 1.6,
            borderRadius: 2,
            backgroundColor: piece.color,
            opacity: progress[i].interpolate({ inputRange: [0, 0.85, 1], outputRange: [1, 1, 0] }),
            transform: [
              {
                translateY: progress[i].interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, height + 40],
                }),
              },
              {
                rotate: progress[i].interpolate({
                  inputRange: [0, 1],
                  outputRange: ['0rad', `${piece.spin * Math.PI}rad`],
                }),
              },
            ],
          }}
        />
      ))}
    </View>
  );
}
