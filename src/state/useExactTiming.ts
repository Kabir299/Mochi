import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { exactTimingAllowed } from '@/lib/reminders';

// Whether reminders can fire at the exact minute (see lib/reminders.ts). Re-checked each
// time the app comes back to the front, since it's changed in system settings.
export function useExactTiming() {
  const [allowed, setAllowed] = useState(true);
  useEffect(() => {
    let cancelled = false;
    const check = () =>
      exactTimingAllowed()
        .then((ok) => {
          if (!cancelled) setAllowed(ok);
        })
        .catch(() => {});
    check();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') check();
    });
    return () => {
      cancelled = true;
      sub.remove();
    };
  }, []);
  return allowed;
}
