import { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { closeModal } from '@/lib/nav';
import { colors, spacing } from '@/theme';

type Props = {
  title: string;
  leftLabel?: string;
  right?: ReactNode;
};

export function ModalHeader({ title, leftLabel = 'Close', right }: Props) {
  return (
    <View style={styles.bar}>
      <Pressable onPress={() => closeModal()} hitSlop={12} style={styles.side}>
        <Text style={styles.action}>{leftLabel}</Text>
      </Pressable>
      <Text style={styles.title}>{title}</Text>
      <View style={[styles.side, styles.right]}>{right}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg + 4,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  side: {
    minWidth: 60,
  },
  right: {
    alignItems: 'flex-end',
  },
  title: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '600',
  },
  action: {
    color: colors.textMuted,
    fontSize: 16,
  },
});
