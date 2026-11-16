import { Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { colors, spacing, themedStyles } from '@/theme';

export const PRIVACY_SHORT =
  'Your habits and logs stay on this phone unless you sign in to sync them. AI features send a summary only when you use them, and our server deletes it as soon as the answer is back.';

const AI_NOTE = 'Sent only to get this answer. Our server deletes it right after.';

// A small lock line. The default text is for AI screens; pass `text` for other places.
export function PrivacyNote({ text = AI_NOTE }: { text?: string }) {
  return (
    <View style={styles.row} accessibilityRole="text">
      <Ionicons name="lock-closed" size={13} color={colors.textMuted} style={styles.icon} />
      <Text style={styles.text}>{text}</Text>
    </View>
  );
}

const styles = themedStyles(() => ({
  row: {
    flexDirection: 'row',
    gap: spacing.xs + 2,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  icon: { marginTop: 2 },
  text: { flex: 1, color: colors.textMuted, fontSize: 12, lineHeight: 17 },
}));
