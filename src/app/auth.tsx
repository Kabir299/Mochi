import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';

import { useAccount } from '@/state/account';
import { colors, spacing, themedStyles } from '@/theme';

// Where Google sends the person back to after signing in, with a one-time code in the address.
export default function AuthScreen() {
  const { code, error_description: problem } = useLocalSearchParams<{
    code?: string;
    error_description?: string;
  }>();
  const { completeSignIn } = useAccount();
  const [failed, setFailed] = useState(false);

  const leave = () => (router.canGoBack() ? router.back() : router.replace('/'));

  useEffect(() => {
    if (!code) return;
    let gone = false;
    completeSignIn(code)
      .then(() => !gone && leave())
      .catch(() => !gone && setFailed(true));
    return () => {
      gone = true;
    };
  }, [code, completeSignIn]);

  const stuck = failed || !code;
  return (
    <View style={styles.screen}>
      {stuck ? (
        <>
          <Text style={styles.text}>
            {problem ?? 'Sign-in didn’t finish. Nothing was changed; you can try again from Settings.'}
          </Text>
          <Pressable onPress={leave} accessibilityRole="button">
            <Text style={styles.link}>Back to Mochi</Text>
          </Pressable>
        </>
      ) : (
        <>
          <ActivityIndicator color={colors.accent} />
          <Text style={styles.text}>Signing you in…</Text>
        </>
      )}
    </View>
  );
}

const styles = themedStyles(() => ({
  screen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    padding: spacing.xl,
    backgroundColor: colors.background,
  },
  text: {
    color: colors.textMuted,
    fontSize: 15,
    textAlign: 'center',
  },
  link: {
    color: colors.accent,
    fontSize: 15,
    fontWeight: '600',
  },
}));
