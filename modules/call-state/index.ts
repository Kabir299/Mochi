import { requireOptionalNativeModule } from 'expo';

const native = requireOptionalNativeModule<{ inCall: () => boolean }>('MochiCallState');

// Whether a call is ringing or going on right now. Needs no permission and says nothing about
// who is calling. Always false on the web and in Expo Go.
export function inCall(): boolean {
  try {
    return native?.inCall() ?? false;
  } catch {
    return false;
  }
}
