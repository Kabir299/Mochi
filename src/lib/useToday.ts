import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { toDateKey } from '@/lib/dates';

// Today's date that moves on at midnight and when the app comes back to the
// foreground, so screens left open overnight don't keep showing yesterday.
export function useToday(): Date {
  const [today, setToday] = useState(() => new Date());

  useEffect(() => {
    const refresh = () =>
      setToday((prev) => {
        const now = new Date();
        return toDateKey(now) === toDateKey(prev) ? prev : now;
      });
    const now = new Date();
    const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 5);
    const timer = setTimeout(refresh, midnight.getTime() - now.getTime());
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh();
    });
    return () => {
      clearTimeout(timer);
      sub.remove();
    };
  }, [today]);

  return today;
}
