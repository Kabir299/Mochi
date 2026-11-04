import { useCallback } from 'react';
import { Alert, Platform } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';

import { pickBackup } from '@/lib/backup';
import { confirmAction, confirmDestructive } from '@/lib/confirm';
import { restoreAll } from '@/lib/db';
import { useHabits } from '@/state/habits';
import { useNutrition } from '@/state/nutrition';
import { useSettings } from '@/state/settings';

function tell(title: string, message: string) {
  if (Platform.OS === 'web') window.alert(`${title}\n\n${message}`);
  else Alert.alert(title, message);
}

// Picks a backup file, asks before replacing anything, restores it and refreshes the
// app. Resolves true when the data was restored.
export function useRestoreBackup() {
  const database = useSQLiteContext();
  const { habits, reload } = useHabits();
  const nutrition = useNutrition();
  const settings = useSettings();

  return useCallback(async () => {
    let backup;
    try {
      backup = await pickBackup();
    } catch (e) {
      tell('Can’t restore', e instanceof Error ? e.message : 'That file couldn’t be read.');
      return false;
    }
    if (!backup) return false;

    const count = backup.habits.length;
    const saved = backup.exported_at
      ? ` saved on ${new Date(backup.exported_at).toLocaleDateString()}`
      : '';
    const summary = `${count} habit${count === 1 ? '' : 's'} with their history${saved}.`;
    const ok =
      habits.length === 0
        ? await confirmAction('Restore this backup?', summary, 'Restore')
        : await confirmDestructive(
            'Replace what’s on this phone?',
            `${summary} Everything currently on this phone will be replaced.`,
            'Replace',
          );
    if (!ok) return false;

    try {
      await restoreAll(database, backup);
    } catch {
      tell('Can’t restore', 'Nothing was changed. Try again, or save a fresh backup.');
      return false;
    }
    await Promise.all([reload(), nutrition.reload(), settings.reload()]);
    // Someone restoring already knows the app, whatever the file says.
    await settings.update({ onboarded: true, guideSeen: true, nutritionGuideSeen: true });
    return true;
  }, [database, habits.length, reload, nutrition, settings]);
}
