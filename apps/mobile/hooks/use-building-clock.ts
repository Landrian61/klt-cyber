import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';

/** How often the open/closed labels are recomputed while a screen is focused. */
const TICK_MS = 60_000;

/**
 * A clock that advances once a minute while the screen is focused (spec 0018,
 * AC-22).
 *
 * "Open now" is computed on the CLIENT, by `isFacilityOpenNow`, because a
 * Convex query result caches on its arguments: a server-computed flag would
 * not flip as the clock passed closing time, and re-asking the server on a
 * timer would mean a new subscription per tick.
 *
 * So the timestamp has to come from somewhere, and it cannot be a bare
 * `Date.now()` read during render — that value never changes once React has
 * rendered, so a label would sit stale through a closing time for as long as
 * the screen stayed open.
 *
 * Focused only, and cleared on blur: a screen nobody is looking at has no
 * reason to wake the JS thread sixty times an hour. Re-reading the clock on
 * focus is the other half of that bargain, since a screen backgrounded at
 * 16:58 and returned to at 19:00 must not still read "Open now".
 *
 * Rounded down to the minute so the value is stable within a tick, which keeps
 * it from invalidating memoised children more often than the labels can
 * actually change.
 */
export function useBuildingClock(): number {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 60_000) * 60_000);

  useFocusEffect(
    useCallback(() => {
      // Re-read immediately: time has very likely passed since the last focus.
      setNow(Math.floor(Date.now() / 60_000) * 60_000);

      const id = setInterval(() => {
        setNow(Math.floor(Date.now() / 60_000) * 60_000);
      }, TICK_MS);

      return () => clearInterval(id);
    }, []),
  );

  return now;
}
