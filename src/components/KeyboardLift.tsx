import { ComponentRef, ReactNode, useEffect, useRef, useState } from 'react';
import {
  Keyboard,
  KeyboardEvent,
  LayoutAnimation,
  Platform,
  StyleProp,
  View,
  ViewStyle,
} from 'react-native';

// Keeps the bottom of a screen, like a chat box, above the keyboard. React Native's
// KeyboardAvoidingView doesn't manage this here: Android apps now draw behind the system bars,
// so the screen no longer shrinks for the keyboard, and on iPhone a sheet sits lower than the
// screen top, which throws its sums off. Instead this measures where its own bottom edge really
// is and lifts it by exactly as much as the keyboard covers.
export function KeyboardLift({
  style,
  children,
}: {
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}) {
  const ref = useRef<ComponentRef<typeof View>>(null);
  const [lift, setLift] = useState(0);

  useEffect(() => {
    const ios = Platform.OS === 'ios';
    const animate = (e?: KeyboardEvent) => {
      if (ios && e?.duration) {
        LayoutAnimation.configureNext({
          duration: e.duration,
          update: { type: LayoutAnimation.Types.keyboard },
        });
      }
    };
    const show = Keyboard.addListener(ios ? 'keyboardWillShow' : 'keyboardDidShow', (e) => {
      ref.current?.measureInWindow((_x, y, _w, height) => {
        // The padding is inside this view, so its bottom edge doesn't move as it lifts.
        const next = Math.max(0, Math.round(y + height - e.endCoordinates.screenY));
        animate(e);
        setLift(next);
      });
    });
    const hide = Keyboard.addListener(ios ? 'keyboardWillHide' : 'keyboardDidHide', (e) => {
      animate(e);
      setLift(0);
    });
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  return (
    <View ref={ref} style={[style, { paddingBottom: lift }]}>
      {children}
    </View>
  );
}
