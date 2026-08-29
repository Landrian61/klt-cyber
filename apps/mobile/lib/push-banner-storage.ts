import AsyncStorage from '@react-native-async-storage/async-storage';

// Local, per-device dismissal state for the Home push-notification banner —
// deliberately NOT synced through Convex: it's a "don't nag me again on this
// phone for a while" preference, not account data. AsyncStorage is used
// directly since there's no existing local-persistence pattern in this app to
// match (session tokens use expo-secure-store instead — see lib/auth.ts —
// but that's a different concern: a secret, not a UI preference).

const DISMISSED_AT_KEY = '@klt-cyber/push-banner-dismissed-at';

/**
 * How long a dismissal hides the banner before it's eligible to reappear.
 * A named constant, not a magic number, so this is a one-line change later.
 */
export const PUSH_BANNER_DISMISS_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/** The dismissal timestamp (unix ms), or null if never dismissed. */
export async function getPushBannerDismissedAt(): Promise<number | null> {
  const raw = await AsyncStorage.getItem(DISMISSED_AT_KEY);
  return raw ? Number(raw) : null;
}

/** Records "dismissed now" — does not touch permission state at all. */
export async function setPushBannerDismissedNow(): Promise<void> {
  await AsyncStorage.setItem(DISMISSED_AT_KEY, String(Date.now()));
}
