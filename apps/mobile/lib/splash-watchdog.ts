import * as SplashScreen from 'expo-splash-screen';

/**
 * Last-resort guarantee that the native splash screen always lifts.
 *
 * `expo-splash-screen` holds the native splash up until something actually
 * renders, so any failure before the first frame — a module that throws while
 * being imported, a provider that never resolves, an asset that never loads —
 * parks the app on the splash forever with nothing on screen to explain it.
 * A release build has no LogBox to fall back on, so it simply looks frozen.
 *
 * That is precisely how a Sentry dependency-version clash took the app down:
 * `apps/admin` hoisted `@sentry/*` v11 into the shared (and, for Metro,
 * mandatory) flat `node_modules`, `@sentry/react-native@8.30.0` resolved those
 * instead of the v10 line it requires, a class ended up extending `undefined`,
 * and the throw happened while `app/_layout.tsx` was still being imported.
 * Nothing mounted, so every launch ended on the navy splash with no error
 * visible anywhere on the device.
 *
 * Note what that means for placement: the layout's own module body never ran,
 * so a guard written there could not have helped. This module is deliberately
 * tiny, depends on nothing but `expo-splash-screen`, and is imported FIRST by
 * `app/_layout.tsx` — before any import that could realistically fail. It
 * therefore owns `preventAutoHideAsync` (previously called in the layout body)
 * and arms a timer that hides the splash no matter what else went wrong.
 *
 * A blank screen is not a good outcome, but it is an honest and debuggable
 * one: visibly broken rather than deceptively still loading, with the real
 * error reaching logcat and Sentry instead of being masked by a splash that
 * never goes away.
 *
 * On the normal path `AnimatedSplash` hides the splash on its own first frame,
 * long before this fires, and `hideAsync` is safe to call once the splash is
 * already gone — so this costs a single no-op timer per launch.
 */
const SPLASH_WATCHDOG_MS = 10_000;

SplashScreen.preventAutoHideAsync().catch(() => {});

setTimeout(() => {
  SplashScreen.hideAsync().catch(() => {});
}, SPLASH_WATCHDOG_MS);
