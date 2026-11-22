import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import type { PurchasesPackage } from 'react-native-purchases';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

import { closeModal } from '@/lib/nav';
import { ModalHeader } from '@/components/ModalHeader';
import {
  buy,
  configurePurchases,
  loadPackages,
  manageUrl,
  paymentsEnabled,
  perLabel,
  periodLabel,
  restore,
  trialText,
} from '@/lib/purchases';
import { IconName } from '@/state/habits';
import { useSettings } from '@/state/settings';
import { colors, radius, spacing, themedStyles } from '@/theme';

const FEATURES: { icon: IconName; title: string; body: string }[] = [
  {
    icon: 'sparkles-outline',
    title: 'AI analysis',
    body: 'A personal review of your habits with specific tips to improve.',
  },
  {
    icon: 'mic-outline',
    title: 'Plan my day and coach',
    body: 'Say what’s on your mind and get a timed plan; chat with a coach who knows your habits.',
  },
  {
    icon: 'restaurant-outline',
    title: 'Calorie tracking',
    body: 'Log meals with AI-estimated calories and protein against your daily goals.',
  },
];

// Apple's standard licence; swap for your own terms page if you write one.
const TERMS_URL = 'https://www.apple.com/legal/internet-services/itunes/dev/stdeula/';
const PRIVACY_URL = process.env.EXPO_PUBLIC_PRIVACY_URL;
const STORE = Platform.OS === 'ios' ? 'App Store' : 'Google Play';

export default function ProScreen() {
  const { isPro, update } = useSettings();
  const [packages, setPackages] = useState<PurchasesPackage[] | null>(null);
  const [chosen, setChosen] = useState(0);
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    if (!paymentsEnabled) return;
    configurePurchases();
    loadPackages()
      .then(setPackages)
      .catch(() => setLoadError(true));
  }, []);

  const purchase = async () => {
    const pkg = packages?.[chosen];
    if (!pkg) return;
    setBusy(true);
    try {
      if (await buy(pkg)) {
        await update({ isPro: true });
        closeModal();
      }
    } catch (error) {
      Alert.alert('Purchase failed', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const restorePurchases = async () => {
    setBusy(true);
    try {
      const pro = await restore();
      await update({ isPro: pro });
      Alert.alert(
        pro ? 'Pro restored' : 'Nothing to restore',
        pro ? 'Welcome back!' : `No active Pro subscription was found on this ${STORE} account.`,
      );
    } catch {
      Alert.alert('Restore failed', 'Check your internet connection and try again.');
    } finally {
      setBusy(false);
    }
  };

  const manage = async () => {
    const url =
      (await manageUrl().catch(() => null)) ??
      (Platform.OS === 'ios'
        ? 'https://apps.apple.com/account/subscriptions'
        : 'https://play.google.com/store/account/subscriptions');
    Linking.openURL(url);
  };

  const trial = packages?.[chosen] ? trialText(packages[chosen]) : null;

  return (
    <SafeAreaView style={styles.safe}>
      <ModalHeader title="Pro" />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <View style={styles.heroIcon}>
            <Ionicons name="diamond-outline" size={30} color={colors.streak} />
          </View>
          <Text style={styles.title}>Mochi Pro</Text>
          <Text style={styles.subtitle}>
            {isPro
              ? 'You have Pro. Thank you for supporting Mochi!'
              : 'Go beyond checkboxes and see what actually moves you forward.'}
          </Text>
        </View>

        <View style={styles.card}>
          {FEATURES.map((f) => (
            <View key={f.title} style={styles.feature}>
              <Ionicons name={f.icon} size={22} color={colors.accent} />
              <View style={styles.featureBody}>
                <Text style={styles.featureTitle}>{f.title}</Text>
                <Text style={styles.featureText}>{f.body}</Text>
              </View>
            </View>
          ))}
        </View>

        {!paymentsEnabled ? (
          <>
            <Pressable
              onPress={async () => {
                await update({ isPro: !isPro });
                if (!isPro) closeModal();
              }}
              style={({ pressed }) => [
                isPro ? styles.secondaryButton : styles.button,
                pressed && styles.pressed,
              ]}
              accessibilityRole="button"
            >
              <Text style={isPro ? styles.secondaryText : styles.buttonText}>
                {isPro ? 'Turn off Pro' : 'Unlock Pro'}
              </Text>
            </Pressable>
            <Text style={styles.note}>
              Test mode: no RevenueCat key is set, so Pro unlocks for free on this device.
            </Text>
          </>
        ) : isPro ? (
          <Pressable onPress={manage} style={styles.secondaryButton} accessibilityRole="button">
            <Text style={styles.secondaryText}>Manage subscription</Text>
          </Pressable>
        ) : loadError ? (
          <Text style={styles.note}>
            Couldn’t load prices. Check your connection and open this page again.
          </Text>
        ) : !packages ? (
          <ActivityIndicator color={colors.accent} />
        ) : (
          <>
            {packages.map((pkg, i) => {
              const planTrial = trialText(pkg);
              return (
                <Pressable
                  key={pkg.identifier}
                  onPress={() => setChosen(i)}
                  style={[styles.plan, i === chosen && styles.planOn]}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: i === chosen }}
                >
                  <View style={styles.featureBody}>
                    <Text style={styles.featureTitle}>{periodLabel(pkg)}</Text>
                    {planTrial && <Text style={styles.trial}>{planTrial}</Text>}
                  </View>
                  <Text style={styles.price}>
                    {pkg.product.priceString} {perLabel(pkg)}
                  </Text>
                </Pressable>
              );
            })}
            <Pressable
              onPress={purchase}
              disabled={busy || packages.length === 0}
              style={({ pressed }) => [styles.button, (pressed || busy) && styles.pressed]}
              accessibilityRole="button"
            >
              {busy ? (
                <ActivityIndicator color={colors.onAccent} />
              ) : (
                <Text style={styles.buttonText}>{trial ? 'Start free trial' : 'Continue'}</Text>
              )}
            </Pressable>
            <Text style={styles.note}>
              {trial ? `After the ${trial}, the` : 'The'} subscription renews automatically until
              cancelled. Cancel any time in your {STORE} account settings at least 24 hours before
              it renews.
            </Text>
          </>
        )}

        {paymentsEnabled && (
          <View style={styles.links}>
            <Pressable onPress={restorePurchases} disabled={busy} hitSlop={8}>
              <Text style={styles.link}>Restore purchases</Text>
            </Pressable>
            <Pressable onPress={() => Linking.openURL(TERMS_URL)} hitSlop={8}>
              <Text style={styles.link}>Terms</Text>
            </Pressable>
            {PRIVACY_URL && (
              <Pressable onPress={() => Linking.openURL(PRIVACY_URL)} hitSlop={8}>
                <Text style={styles.link}>Privacy</Text>
              </Pressable>
            )}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = themedStyles(() => ({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.lg + 4,
    gap: spacing.lg,
  },
  hero: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.lg,
  },
  heroIcon: {
    width: 64,
    height: 64,
    borderRadius: radius.pill,
    backgroundColor: colors.proBg,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  title: {
    color: colors.text,
    fontSize: 24,
    fontWeight: '700',
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: 15,
    lineHeight: 21,
    textAlign: 'center',
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    padding: spacing.lg,
    gap: spacing.lg,
  },
  feature: {
    flexDirection: 'row',
    gap: spacing.md,
    alignItems: 'flex-start',
  },
  featureBody: {
    flex: 1,
    gap: 2,
  },
  featureTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  featureText: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
  },
  plan: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.card,
    borderRadius: radius.card,
    borderWidth: 2,
    borderColor: colors.card,
    padding: spacing.lg,
  },
  planOn: {
    borderColor: colors.accent,
  },
  trial: {
    color: colors.accent,
    fontSize: 13,
  },
  price: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  button: {
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
    paddingVertical: spacing.md + 2,
    alignItems: 'center',
  },
  buttonText: {
    color: colors.onAccent,
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingVertical: spacing.md + 2,
    alignItems: 'center',
  },
  secondaryText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '500',
  },
  pressed: {
    opacity: 0.7,
  },
  links: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.xl,
  },
  link: {
    color: colors.textMuted,
    fontSize: 13,
    textDecorationLine: 'underline',
  },
  note: {
    color: colors.iconMuted,
    fontSize: 12,
    lineHeight: 17,
    textAlign: 'center',
  },
}));
