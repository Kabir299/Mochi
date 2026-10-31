import { useEffect } from 'react';
import Purchases from 'react-native-purchases';

import { addProListener, configurePurchases, hasPro, paymentsEnabled } from '@/lib/purchases';
import { useSettings } from '@/state/settings';

// Keeps settings.isPro in step with the store subscription: bought, renewed,
// expired or refunded. Renders nothing.
export function PurchasesSync() {
  const { loaded, update } = useSettings();

  useEffect(() => {
    if (!paymentsEnabled || !loaded) return;
    configurePurchases();
    let active = true;
    Purchases.getCustomerInfo()
      .then((info) => {
        if (active) update({ isPro: hasPro(info) });
      })
      // Offline: keep the last known status until the store can be reached.
      .catch(() => {});
    const remove = addProListener((pro) => update({ isPro: pro }));
    return () => {
      active = false;
      remove();
    };
  }, [loaded, update]);

  return null;
}
