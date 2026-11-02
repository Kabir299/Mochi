import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import type { SQLiteDatabase } from 'expo-sqlite';
import { Platform } from 'react-native';

import { toDateKey } from '@/lib/dates';
import { exportAll, parseBackup } from '@/lib/db';

// Habits live only on the phone, so moving to a new one goes through a file the
// person keeps themselves (Drive, iCloud, a chat to themselves). Nothing is uploaded.

export async function saveBackup(db: SQLiteDatabase) {
  const json = JSON.stringify(await exportAll(db));
  const name = `mochi-backup-${toDateKey(new Date())}.json`;
  if (Platform.OS === 'web') {
    // Browsers can't share files, so download it instead.
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    link.click();
    URL.revokeObjectURL(url);
    return;
  }
  const file = new File(Paths.cache, name);
  file.create({ overwrite: true });
  await file.write(json);
  await Sharing.shareAsync(file.uri, {
    mimeType: 'application/json',
    UTI: 'public.json',
    dialogTitle: 'Save your Mochi backup',
  });
}

// Lets the person pick a backup file and checks it. Returns null if they cancel;
// throws a message fit to show when the file is wrong. Nothing is changed yet.
export async function pickBackup() {
  const result = await DocumentPicker.getDocumentAsync({
    // Drive and chat apps often label JSON as plain bytes, so accept anything and check it.
    type: '*/*',
    copyToCacheDirectory: true,
  });
  if (result.canceled) return null;
  const { uri } = result.assets[0];
  const text = Platform.OS === 'web' ? await (await fetch(uri)).text() : await new File(uri).text();
  return parseBackup(text);
}
