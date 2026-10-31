import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radius, spacing } from '@/theme';

const SHOW_MS = 4000;

// A short bar at the bottom with an Undo button, for taps made by mistake.
export function UndoToast({
  message,
  onUndo,
  onHide,
}: {
  message: string;
  onUndo: () => void;
  onHide: () => void;
}) {
  useEffect(() => {
    const timer = setTimeout(onHide, SHOW_MS);
    return () => clearTimeout(timer);
  }, [message, onHide]);

  return (
    <View style={styles.wrap} pointerEvents="box-none">
      <View style={styles.toast} accessibilityLiveRegion="polite">
        <Text style={styles.text} numberOfLines={1}>
          {message}
        </Text>
        <Pressable
          onPress={() => {
            onUndo();
            onHide();
          }}
          hitSlop={10}
          accessibilityRole="button"
        >
          <Text style={styles.undo}>Undo</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    bottom: spacing.lg,
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.border,
    borderRadius: radius.card,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  text: {
    flex: 1,
    color: colors.text,
    fontSize: 14,
  },
  undo: {
    color: colors.accent,
    fontSize: 15,
    fontWeight: '700',
  },
});
