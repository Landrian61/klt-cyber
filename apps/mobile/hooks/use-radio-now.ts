import { useEffect, useMemo, useState } from 'react';
import { useQuery } from 'convex/react';
import type { FunctionReturnType } from 'convex/server';
import {
  deriveRadioStatus,
  resolveCurrentBroadcast,
  resolveNextBroadcast,
  type RadioDisplayStatus,
} from '@klt-cyber/shared';

import { api } from '@/lib/api';

type NowPlaying = NonNullable<FunctionReturnType<typeof api.radio.getNowPlaying>>;
export type RadioBroadcastView = NowPlaying['broadcasts'][number];

/**
 * A clock that ticks every `intervalMs`. The radio derives its status and
 * picks current and next from THIS clock rather than from the server
 * (spec 0019, AC-3, AC-7), so a rollover at a start time and a probe going
 * stale both show without waiting for a server write.
 */
export function useTickingClock(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

export interface RadioNow {
  /** undefined while loading, null when signed out or the query failed. */
  data: NowPlaying | null | undefined;
  status: RadioDisplayStatus;
  current: RadioBroadcastView | null;
  next: RadioBroadcastView | null;
  now: number;
}

/**
 * What is on Reign Radio right now, resolved on the phone (AC-3, AC-7).
 *
 * Several surfaces call this (the Radio tab, the player behind the lock
 * screen, and Home's Live now card later); the Convex client shares one
 * subscription between them, so a second caller costs nothing.
 */
export function useRadioNow(intervalMs = 1000): RadioNow {
  const data = useQuery(api.radio.getNowPlaying, {});
  const now = useTickingClock(intervalMs);

  return useMemo(() => {
    if (!data) {
      return { data, status: 'off_air', current: null, next: null, now };
    }
    return {
      data,
      status: deriveRadioStatus(data.reading, now),
      current: resolveCurrentBroadcast(data.broadcasts, now),
      next: resolveNextBroadcast(data.broadcasts, now),
      now,
    };
  }, [data, now]);
}
