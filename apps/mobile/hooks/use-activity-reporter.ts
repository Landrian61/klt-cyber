import { useEffect, useRef } from 'react';
import { AppState, Platform, type AppStateStatus } from 'react-native';
import Constants from 'expo-constants';
import { useMutation } from 'convex/react';
import { ACTIVITY_REPORT_THROTTLE_MS } from '@klt-cyber/shared';

import { api } from '@/lib/api';
import { getDeviceId } from '@/lib/device-id';

/**
 * Reports "this phone is being used" while signed in (spec 0011, SRS F1-11).
 *
 * Fires on launch and on every return to the foreground. The server does its
 * own 55-minute check and is the real cap; the copy kept here is purely an
 * optimisation, so a user flicking between apps does not spend a round trip
 * every time to be told nothing changed.
 *
 * Failure is swallowed deliberately and never retried within the hour.
 * Activity reporting is not allowed to surface an error, block a screen, or
 * delay anything the user asked for — a missed hour costs exactly one data
 * point on an internal page, which is never worth interrupting somebody's app
 * over.
 */
export function useActivityReporter(isAuthenticated: boolean) {
  const recordActivity = useMutation(api.activity.recordActivity);
  // Kept in a ref rather than state: it must not re-render anything, and the
  // AppState listener below has to read the latest value without being torn
  // down and rebuilt on every report.
  const lastReportedAt = useRef(0);

  useEffect(() => {
    if (!isAuthenticated) {
      // Sign-out resets the local clock, so the next person to sign in on this
      // phone reports immediately rather than inheriting the hour somebody
      // else already spent.
      lastReportedAt.current = 0;
      return;
    }

    let cancelled = false;

    async function report() {
      const now = Date.now();
      if (now - lastReportedAt.current < ACTIVITY_REPORT_THROTTLE_MS) return;
      // Claimed before awaiting, so a launch that races a foreground event
      // cannot send the same report twice.
      lastReportedAt.current = now;

      try {
        // `userDevices` counts phones, and has no `web` member by design. On
        // anything that is not a phone (Expo web) the activity is still worth
        // reporting; the device triple simply goes unsent, and the server
        // accepts all three or none.
        const platform =
          Platform.OS === 'ios'
            ? ('ios' as const)
            : Platform.OS === 'android'
              ? ('android' as const)
              : null;

        if (platform === null) {
          await recordActivity({});
          return;
        }

        const deviceId = await getDeviceId();
        if (cancelled) return;
        await recordActivity({
          deviceId,
          platform,
          appVersion: Constants.expoConfig?.version ?? 'unknown',
        });
      } catch {
        // Allow the next foreground to try again rather than holding the
        // claimed slot for an hour on a failure that may have been a blip.
        lastReportedAt.current = 0;
      }
    }

    report();

    const subscription = AppState.addEventListener(
      'change',
      (next: AppStateStatus) => {
        if (next === 'active') report();
      },
    );

    return () => {
      cancelled = true;
      subscription.remove();
    };
  }, [isAuthenticated, recordActivity]);
}
