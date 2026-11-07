import * as SplashScreen from 'expo-splash-screen';

/**
 * Last-resort guarantee that the native splash screen always lifts.
 *
 * `expo-splash-screen` holds the native splash up until something actually
 * renders, so any failure before the first frame parks the app on the splash
 * forever with nothing on screen to explain it. A release build has no LogBox
 * to fall back on, so it simply looks frozen rather than broken.
 *
 * That is precisely how a Sentry dependency-version clash took the app down:
 * `apps/admin` hoisted `@sentry/*` v11 into the shared (and, for Metro,
 * mandatory) flat `node_modules`, `@sentry/react-native@8.30.0` resolved those
 * instead of the v10 line it requires, a class ended up extending `undefined`,
 * and the throw happened while `app/_layout.tsx` was still being imported.
 * Nothing mounted, so every launch ended on the navy splash.
 *
 * Note what that means for placement: the layout's own module body never ran,
 * so a guard written there could not have helped. This module depends on
 * nothing but `expo-splash-screen`, and is imported first by
 * `app/_layout.tsx` — so it is evaluated before that file's other imports and
 * owns `preventAutoHideAsync`, which used to sit in the layout body.
 *
 * Coverage boundary, deliberately not total: the real entry point is
 * `expo-router/entry` (see this package's `main`), so anything that throws
 * inside *its* import graph — Reanimated, `@expo/metro-runtime`, the Sentry
 * Metro serializer — still fails before this module is reached, with
 * `preventAutoHideAsync` yet to run. What is covered is everything
 * `app/_layout.tsx` pulls in, which is where this app's own dependencies live
 * and where the clash above actually struck.
 *
 * The error does NOT reach Sentry. `initSentry()` runs in the layout's module
 * body, after its imports, so an import-time throw happens before Sentry
 * exists to report it. Initialising Sentry here instead would mean this module
 * importing `@sentry/react-native` — the very thing that failed — so the
 * watchdog stays dependency-free on purpose. For this class of failure logcat
 * on a cabled device remains the evidence; what the watchdog buys is a screen
 * that is visibly broken instead of one that looks like it is still loading.
 */
const SPLASH_WATCHDOG_MS = 10_000;

SplashScreen.preventAutoHideAsync().catch(() => {});

const watchdog = setTimeout(() => {
  SplashScreen.hideAsync().catch(() => {});
}, SPLASH_WATCHDOG_MS);

/**
 * Stands the watchdog down once `AnimatedSplash` has mounted and taken over
 * hiding the splash itself.
 *
 * Without this the timer is unconditional, so a slow but perfectly healthy
 * cold start that crosses the timeout — a low-end device still loading fonts
 * and evaluating the bundle — would uncover the bare cream font-gate screen
 * and only then play the full 2.3s blue intro, reading backwards. Cancelling
 * here leaves the timer firing only when the splash was never handed over,
 * which is exactly the failure it exists for.
 */
export function cancelSplashWatchdog(): void {
  clearTimeout(watchdog);
}
