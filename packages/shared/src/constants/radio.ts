/**
 * Radio core's shared contract (spec 0019).
 *
 * Every union, cap, timing rule, seeded program and pure helper the radio
 * feature depends on lives here rather than inside the Convex function that
 * enforces it, for the same reason `library.ts` and `realEstate.ts` exist:
 * three readers have to agree. The probe writes the status row, the server
 * derives Live / Off air / Stream interrupted for a query, and the phone derives
 * it AGAIN from the same row and its own clock (AC-3). Two copies of the five
 * minute grace would let the portal and the app disagree about whether the
 * stream is interrupted.
 *
 * Deliberately reuses `KAMPALA_UTC_OFFSET_MS` from `./weeklyPrograms`, so the
 * fixed +3 still lives in exactly one constant. The occurrence arithmetic below
 * is the same `Date.UTC(...) - offset` that `occurrenceInstant` in
 * `convex/calendar.ts` performs; it is restated here only because this package
 * cannot import from `convex/`, and the materialisation job, the schedule query
 * and the phone's day headings all need it.
 *
 * Runtime agnostic: no React, React Native, Node or Convex imports.
 */

import { z } from 'zod';
import { KAMPALA_UTC_OFFSET_MS } from './weeklyPrograms';

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

// -- The department --------------------------------------------------------

/**
 * The `departments.name` that grants `manageRadio` (AC-32).
 *
 * Exactly the string `convex/seed.ts` writes. A mismatch is silent: the
 * capability would read false for everyone but a System Admin, so a Convex test
 * asserts this matches a seeded row rather than trusting the two to agree.
 */
export const MEDIA_DEPARTMENT_NAME = 'Media';

/**
 * The department whose HOD and delegates also read the Radio inbox (AC-38).
 * SRS PS2-03 gives Pastoral and Media the same view.
 */
export const PASTORAL_DEPARTMENT_NAME = 'Pastoral';

// -- Status ----------------------------------------------------------------

/**
 * What a probe found, as stored on `radioStatus.detected`.
 *
 * `unknown` is a probe that could not reach the stream at all. It keeps the
 * last finding rather than inventing one (AC-39).
 */
export const RADIO_DETECTED_STATES = ['live', 'off_air', 'unknown'] as const;
export type RadioDetectedState = (typeof RADIO_DETECTED_STATES)[number];

/** What a `manageRadio` holder may force. Interrupted is never forceable (AC-6). */
export const RADIO_OVERRIDE_STATES = ['live', 'off_air'] as const;
export type RadioOverrideState = (typeof RADIO_OVERRIDE_STATES)[number];

/** What a reader is shown: exactly one of these, derived, never stored (AC-3). */
export const RADIO_DISPLAY_STATUSES = ['live', 'off_air', 'interrupted'] as const;
export type RadioDisplayStatus = (typeof RADIO_DISPLAY_STATUSES)[number];

/** The words the player, the Media page and the dashboard card use. */
export const RADIO_DISPLAY_STATUS_LABELS: Record<RadioDisplayStatus, string> = {
  live: 'Live',
  off_air: 'Off air',
  interrupted: 'Stream interrupted',
};

/** A probe older than this reads Off air, however it last read (AC-39). */
export const RADIO_STALE_PROBE_MS = 3 * MINUTE_MS;

/** No source within this long of the last live reading is Interrupted (AC-3). */
export const RADIO_INTERRUPTED_GRACE_MS = 5 * MINUTE_MS;

/**
 * The two extra probes the minute cron schedules while the status is Live or a
 * broadcast window is open (AC-5). Offsets from the cron run, in milliseconds.
 */
export const RADIO_BURST_PROBE_OFFSETS_MS = [20_000, 40_000] as const;

/** How long the stream fallback request may take before it counts as failed. */
export const RADIO_PROBE_FALLBACK_TIMEOUT_MS = 5_000;

/** Tapping play off air gives up after this long with no audio (AC-4). */
export const RADIO_PLAY_ATTEMPT_TIMEOUT_MS = 8_000;

/** The sentence the player shows when that attempt gives up (AC-4). */
export const RADIO_NOTHING_ON_AIR_MESSAGE = 'Nothing on air right now';

/** The subset of a `radioStatus` row the derivation reads. */
export interface RadioStatusReading {
  detected: RadioDetectedState;
  lastProbeAt: number;
  lastLiveAt?: number;
  override?: { state: RadioOverrideState };
}

/**
 * Live, Off air or Stream interrupted, in the order spec 0019 fixes (AC-3,
 * AC-6, AC-39):
 *
 * 1. an override wins;
 * 2. a probe older than three minutes reads Off air, so a stalled cron can
 *    never leave the app saying Live;
 * 3. a live finding reads Live;
 * 4. no source (or an unreachable stream) with the last live reading inside
 *    the five minute grace reads Interrupted;
 * 5. otherwise Off air.
 *
 * `now` is a parameter, never `Date.now()` inside, so the phone can pass its
 * own clock and a test can stand anywhere on the timeline. An absent row (the
 * first probe has not run yet) is Off air.
 */
export function deriveRadioStatus(
  row: RadioStatusReading | null | undefined,
  now: number,
): RadioDisplayStatus {
  if (!row) return 'off_air';
  if (row.override) return row.override.state;
  if (now - row.lastProbeAt > RADIO_STALE_PROBE_MS) return 'off_air';
  if (row.detected === 'live') return 'live';
  if (
    row.lastLiveAt !== undefined &&
    now - row.lastLiveAt < RADIO_INTERRUPTED_GRACE_MS
  ) {
    return 'interrupted';
  }
  return 'off_air';
}

// -- Programs and broadcasts ----------------------------------------------

/**
 * How a program recurs. `occasional` (Holy Ghost Night) is never written ahead
 * and takes airings only by hand (AC-19, AC-20).
 */
export const RADIO_PROGRAM_RECURRENCES = ['weekly', 'occasional'] as const;
export type RadioProgramRecurrence = (typeof RADIO_PROGRAM_RECURRENCES)[number];

/** Where a broadcast row came from. */
export const RADIO_BROADCAST_ORIGINS = ['scheduled', 'oneOff', 'auto'] as const;
export type RadioBroadcastOrigin = (typeof RADIO_BROADCAST_ORIGINS)[number];

/**
 * A broadcast's stored status. On air and finished are read from the clock,
 * never stored; cancelled is reversible by restoring (AC-21).
 */
export const RADIO_BROADCAST_STATUSES = ['scheduled', 'cancelled'] as const;
export type RadioBroadcastStatus = (typeof RADIO_BROADCAST_STATUSES)[number];

/** A program's name, e.g. "Morning Glory". */
export const RADIO_PROGRAM_NAME_MAX_LENGTH = 80;

/** A program's description on the schedule and the player. */
export const RADIO_PROGRAM_DESCRIPTION_MAX_LENGTH = 1000;

/** A typed guest host, e.g. "Pastor John (guest)". */
export const RADIO_HOST_GUEST_NAME_MAX_LENGTH = 80;

/** A one off broadcast's typed name. */
export const RADIO_ONE_OFF_NAME_MAX_LENGTH = 80;

/** The shortest a program or broadcast may run, in minutes. */
export const RADIO_DURATION_MIN_MINUTES = 1;

/**
 * The longest a program may run, in minutes. Super T runs the whole 1440,
 * which is why a program stores a length rather than an end time: an end equal
 * to the start cannot say "a full day".
 */
export const RADIO_DURATION_MAX_MINUTES = 1440;

/** The longest a single broadcast may run, in milliseconds. */
export const RADIO_BROADCAST_MAX_MS = RADIO_DURATION_MAX_MINUTES * MINUTE_MS;

/** How far ahead the schedule reads and the nightly job writes (AC-8, AC-19). */
export const RADIO_SCHEDULE_HORIZON_DAYS = 7;

/**
 * A follow push may fire from this long before `startsAt`, so a source
 * appearing for the soundcheck twenty minutes early does not consume it
 * (AC-11).
 */
export const RADIO_LIVE_PUSH_LEAD_MS = 15 * MINUTE_MS;

/** An `auto` broadcast ends this far out, and each live probe extends it (AC-17). */
export const RADIO_AUTO_BROADCAST_EXTEND_MS = HOUR_MS;

/** What an `auto` broadcast is called when the stream offers no title (AC-17). */
export const RADIO_AUTO_BROADCAST_FALLBACK_TITLE = 'Unscheduled broadcast';

/** Trimmed and lowercased, the key the duplicate name check compares (AC-18). */
export function radioProgramNameKey(name: string): string {
  return name.trim().toLowerCase();
}

const START_TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** True for a 24 hour `"HH:MM"` Kampala wall clock time. */
export function isValidRadioStartTime(value: string): boolean {
  return START_TIME_PATTERN.test(value);
}

/** True for a whole number of minutes from 1 to 1440. */
export function isValidRadioDuration(minutes: number): boolean {
  return (
    Number.isInteger(minutes) &&
    minutes >= RADIO_DURATION_MIN_MINUTES &&
    minutes <= RADIO_DURATION_MAX_MINUTES
  );
}

/** True for a weekday array of 0 (Sunday) to 6, no repeats, at least one. */
export function isValidRadioDays(days: readonly number[]): boolean {
  if (days.length === 0 || days.length > 7) return false;
  if (new Set(days).size !== days.length) return false;
  return days.every((d) => Number.isInteger(d) && d >= 0 && d <= 6);
}

/**
 * Exactly one of the two host fields is set, or neither (AC-22).
 *
 * On a program neither means "no host listed"; on a broadcast neither means
 * "inherit the program's". Both set is the one state no record may hold.
 */
export function isValidRadioHost(host: {
  hostUserId?: string | null;
  hostGuestName?: string | null;
}): boolean {
  const hasUser = !!host.hostUserId;
  const hasGuest = !!host.hostGuestName?.trim();
  return !(hasUser && hasGuest);
}

// -- Seeded programs (R2-01, AC-10, AC-23) --------------------------------

/** The stable key the seed matches on, and the bundled art falls back by. */
export const RADIO_SEED_KEYS = [
  'morning-glory',
  'super-t',
  'midweek-service',
  'tongues-of-fire',
  'holy-ghost-night',
  'early-riser',
  'english-service',
  'luganda-service',
] as const;
export type RadioSeedKey = (typeof RADIO_SEED_KEYS)[number];

/** The one program that is never recorded (RC1-01, AC-24). */
export const SUPER_T_SEED_KEY: RadioSeedKey = 'super-t';

/** True when a program row is Super T, by its seed key. */
export function isSuperTProgram(program: { seedKey?: string | null }): boolean {
  return program.seedKey === SUPER_T_SEED_KEY;
}

export interface RadioSeedProgram {
  seedKey: RadioSeedKey;
  name: string;
  description: string;
  days: number[];
  startTime: string;
  durationMinutes: number;
  recurrence: RadioProgramRecurrence;
  recordByDefault: boolean;
  followedByDefault: boolean;
}

/**
 * The eight programs SRS R2-01 seeds, all active (AC-23).
 *
 * Midweek Service ("Wed about 4PM", no end in the SRS) seeds at 16:00 for two
 * hours and Holy Ghost Night ("occasional Fri", no time in the SRS) at 20:00
 * for nine hours. The engineer chose both during the build, and Media can edit
 * them from the Programs page. `followedByDefault` is true for the three
 * services and false for everything else, Super T included (AC-10).
 * `recordByDefault` is on for every program but Super T, whose flag is forced
 * off (AC-24); Media switches any airing off by hand.
 */
export const RADIO_SEED_PROGRAMS: readonly RadioSeedProgram[] = [
  {
    seedKey: 'morning-glory',
    name: 'Morning Glory',
    description:
      'Start your day in the presence of God. Morning Glory is a broadcast of prayer, worship and the Word to set the tone for your day.',
    days: [1, 3, 4, 5],
    startTime: '06:00',
    durationMinutes: 60,
    recurrence: 'weekly',
    recordByDefault: true,
    followedByDefault: false,
  },
  {
    seedKey: 'super-t',
    name: 'Super T',
    description:
      'Twenty four hours of unbroken prayer, from 6AM Tuesday to 6AM Wednesday, with the clans keeping watch gate by gate.',
    days: [2],
    startTime: '06:00',
    durationMinutes: 1440,
    recurrence: 'weekly',
    recordByDefault: false,
    followedByDefault: false,
  },
  {
    seedKey: 'midweek-service',
    name: 'Midweek Service',
    description:
      'Recharge your week with the Midweek Service: a powerful time of the Word and worship, live from the auditorium.',
    days: [3],
    startTime: '16:00',
    durationMinutes: 120,
    recurrence: 'weekly',
    recordByDefault: true,
    followedByDefault: true,
  },
  {
    seedKey: 'tongues-of-fire',
    name: 'Tongues of Fire',
    description:
      'Three hours of praying in the Spirit every Friday night. Come expecting a fresh encounter with the Holy Ghost.',
    days: [5],
    startTime: '23:00',
    durationMinutes: 180,
    recurrence: 'weekly',
    recordByDefault: true,
    followedByDefault: false,
  },
  {
    seedKey: 'holy-ghost-night',
    name: 'Holy Ghost Night',
    description:
      'A night of worship, prayer and the move of the Holy Ghost, held on chosen Fridays.',
    days: [5],
    startTime: '20:00',
    durationMinutes: 540,
    recurrence: 'occasional',
    recordByDefault: true,
    followedByDefault: false,
  },
  {
    seedKey: 'early-riser',
    name: 'Early Riser',
    description:
      'Sunday begins before dawn: prayer and worship from 4AM to prepare the way for the services.',
    days: [0],
    startTime: '04:00',
    durationMinutes: 240,
    recurrence: 'weekly',
    recordByDefault: true,
    followedByDefault: false,
  },
  {
    seedKey: 'english-service',
    name: 'English Service',
    description: 'The Sunday English service, live from the auditorium.',
    days: [0],
    startTime: '08:00',
    durationMinutes: 150,
    recurrence: 'weekly',
    recordByDefault: true,
    followedByDefault: true,
  },
  {
    seedKey: 'luganda-service',
    name: 'Luganda Service',
    description: 'The Sunday Luganda service, live from the auditorium.',
    days: [0],
    startTime: '10:30',
    durationMinutes: 150,
    recurrence: 'weekly',
    recordByDefault: true,
    followedByDefault: true,
  },
];

// -- Kampala schedule arithmetic ------------------------------------------

/** The unix instant of Kampala midnight on the day containing `instant`. */
export function kampalaDayStartAt(instant: number): number {
  const d = new Date(instant + KAMPALA_UTC_OFFSET_MS);
  return (
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) -
    KAMPALA_UTC_OFFSET_MS
  );
}

/** The `"YYYY-MM-DD"` Kampala day containing `instant`. */
export function kampalaDateKeyAt(instant: number): string {
  return new Date(instant + KAMPALA_UTC_OFFSET_MS).toISOString().slice(0, 10);
}

/** The Kampala weekday (0 is Sunday) containing `instant`. */
export function kampalaWeekdayAt(instant: number): number {
  return new Date(instant + KAMPALA_UTC_OFFSET_MS).getUTCDay();
}

/**
 * The instant of a Kampala wall clock `"HH:MM"` on the Kampala day that starts
 * at `dayStart` (itself a Kampala midnight). Kampala has no DST, so this is a
 * plain addition and a time like "23:00" never lands on the wrong day.
 */
export function kampalaInstantOnDay(dayStart: number, startTime: string): number {
  const [hh, mm] = startTime.split(':').map((n) => Number.parseInt(n, 10));
  return dayStart + (hh || 0) * HOUR_MS + (mm || 0) * MINUTE_MS;
}

/**
 * The end of the materialisation horizon: the end of the Kampala day seven
 * days out (AC-19). Run at 00:30 Kampala on a Monday, that is the end of the
 * following Monday, so a full week ahead always exists.
 */
export function radioMaterialiseHorizonEnd(now: number): number {
  return kampalaDayStartAt(now) + (RADIO_SCHEDULE_HORIZON_DAYS + 1) * DAY_MS;
}

/** The program fields the occurrence expansion reads. */
export interface RadioProgramTiming {
  days: readonly number[];
  startTime: string;
  durationMinutes: number;
  recurrence: RadioProgramRecurrence;
}

/**
 * Every airing of a weekly program whose start falls in `[fromAt, toAt)`.
 *
 * Walks Kampala days, so a Friday 23:00 program of three hours yields a row
 * that starts Friday and ends 02:00 Saturday, and Super T yields one row of a
 * full day rather than two. An occasional program yields nothing: it is never
 * written ahead (AC-19).
 */
export function radioProgramOccurrences(
  program: RadioProgramTiming,
  fromAt: number,
  toAt: number,
): { startsAt: number; endsAt: number }[] {
  if (program.recurrence !== 'weekly') return [];
  if (!isValidRadioStartTime(program.startTime)) return [];
  const out: { startsAt: number; endsAt: number }[] = [];
  const durationMs = program.durationMinutes * MINUTE_MS;
  for (
    let dayStart = kampalaDayStartAt(fromAt);
    dayStart < toAt;
    dayStart += DAY_MS
  ) {
    if (!program.days.includes(kampalaWeekdayAt(dayStart))) continue;
    const startsAt = kampalaInstantOnDay(dayStart, program.startTime);
    if (startsAt < fromAt || startsAt >= toAt) continue;
    out.push({ startsAt, endsAt: startsAt + durationMs });
  }
  return out;
}

/** The fields the current and next resolution reads from a broadcast. */
export interface RadioBroadcastTiming {
  startsAt: number;
  endsAt: number;
  status: RadioBroadcastStatus;
  origin: RadioBroadcastOrigin;
}

/**
 * Which broadcast is on now, under spec 0019's overlap order: a cancelled row
 * is never current; a scheduled or one off row beats an `auto` row; a later
 * `startsAt` beats an earlier one. Null when nothing covers `now`.
 *
 * Shared because the phone decides this from the schedule it already holds and
 * its own clock (AC-7), and the server decides it for a beat (AC-12) and for
 * the probe's auto opener (AC-17). One rule, three callers.
 */
export function resolveCurrentBroadcast<T extends RadioBroadcastTiming>(
  broadcasts: readonly T[],
  now: number,
): T | null {
  let best: T | null = null;
  for (const b of broadcasts) {
    if (b.status === 'cancelled') continue;
    if (!(b.startsAt <= now && now < b.endsAt)) continue;
    if (!best) {
      best = b;
      continue;
    }
    const bAuto = b.origin === 'auto';
    const bestAuto = best.origin === 'auto';
    if (bAuto !== bestAuto) {
      if (!bAuto) best = b;
      continue;
    }
    if (b.startsAt > best.startsAt) best = b;
  }
  return best;
}

/** The earliest non cancelled broadcast that starts after `now`, or null. */
export function resolveNextBroadcast<T extends RadioBroadcastTiming>(
  broadcasts: readonly T[],
  now: number,
): T | null {
  let best: T | null = null;
  for (const b of broadcasts) {
    if (b.status === 'cancelled' || b.startsAt <= now) continue;
    if (!best || b.startsAt < best.startsAt) best = b;
  }
  return best;
}

/**
 * Whether a follow push may fire for this broadcast at `now` (AC-11): inside
 * its window, which opens fifteen minutes before `startsAt`, and never for a
 * cancelled row.
 */
export function isInLivePushWindow(
  broadcast: Pick<RadioBroadcastTiming, 'startsAt' | 'endsAt' | 'status'>,
  now: number,
): boolean {
  return (
    broadcast.status !== 'cancelled' &&
    now >= broadcast.startsAt - RADIO_LIVE_PUSH_LEAD_MS &&
    now < broadcast.endsAt
  );
}

/**
 * The read bounds of the seven day schedule (AC-8): rows starting from a full
 * day before `now` (so one that started yesterday and is still running can be
 * found), up to seven days after `now`. The caller still drops any row whose
 * `endsAt` is not after `now`.
 */
export function radioScheduleWindow(now: number): {
  readFrom: number;
  until: number;
} {
  return {
    readFrom: now - RADIO_BROADCAST_MAX_MS,
    until: now + RADIO_SCHEDULE_HORIZON_DAYS * DAY_MS,
  };
}

/**
 * Broadcasts grouped under Kampala day headings, in start order (AC-8). A
 * broadcast that crosses midnight sits under the day it starts.
 */
export function groupBroadcastsByKampalaDay<T extends { startsAt: number }>(
  broadcasts: readonly T[],
): { dateKey: string; items: T[] }[] {
  const sorted = [...broadcasts].sort((a, b) => a.startsAt - b.startsAt);
  const groups: { dateKey: string; items: T[] }[] = [];
  for (const b of sorted) {
    const dateKey = kampalaDateKeyAt(b.startsAt);
    const last = groups[groups.length - 1];
    if (last && last.dateKey === dateKey) last.items.push(b);
    else groups.push({ dateKey, items: [b] });
  }
  return groups;
}

const RADIO_WEEKDAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];
const RADIO_MONTH_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

/**
 * A schedule day heading for a `"YYYY-MM-DD"` Kampala date key (AC-8):
 * "Today" and "Tomorrow" relative to `now` in Kampala, else
 * "Friday 13 Nov". Shared so the phone and the portal head days alike.
 */
export function formatKampalaDayHeading(dateKey: string, now?: number): string {
  if (now !== undefined) {
    if (dateKey === kampalaDateKeyAt(now)) return 'Today';
    if (dateKey === kampalaDateKeyAt(now + DAY_MS)) return 'Tomorrow';
  }
  const [y, m, d] = dateKey.split('-').map((n) => Number.parseInt(n, 10));
  const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${RADIO_WEEKDAY_NAMES[weekday]} ${d} ${RADIO_MONTH_SHORT[m - 1]}`;
}

/** A Kampala wall clock time as "6:00 AM", whatever the viewer's zone. */
export function formatKampalaTime(instant: number): string {
  const d = new Date(instant + KAMPALA_UTC_OFFSET_MS);
  const h = d.getUTCHours();
  const m = d.getUTCMinutes();
  const suffix = h < 12 ? 'AM' : 'PM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${suffix}`;
}

/** A length in minutes as "1h", "2h 30m" or "45m". */
export function formatRadioDuration(minutes: number): string {
  const whole = Math.max(0, Math.round(minutes));
  const h = Math.floor(whole / 60);
  const m = whole % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

/**
 * Time until a start, for the ticking countdown (AC-7): "2d 4h", "3h 05m",
 * "12:04" under an hour, "0:00" once reached.
 */
export function formatRadioCountdown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(total / 86_400);
  const hours = Math.floor((total % 86_400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${String(minutes).padStart(2, '0')}m`;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

// -- Listening (AC-12 to AC-16) -------------------------------------------

/** The app beats this often while audio is actually playing. */
export const RADIO_BEAT_INTERVAL_MS = 30_000;

/** The most one beat may credit, whatever the gap since the last (AC-12). */
export const RADIO_BEAT_CREDIT_CAP_MS = 45_000;

/** A stretch whose last beat is older than this is closed by the sweep (AC-13). */
export const RADIO_STRETCH_STALE_MS = 90_000;

/** The most devices one user may listen on per broadcast (AC-14). */
export const RADIO_MAX_DEVICES_PER_BROADCAST = 5;

/** A user counts as an in app listener when their last beat is this recent (AC-15). */
export const RADIO_LISTENER_WINDOW_MS = 60_000;

/** The longest a city name passed with a beat may be, after trimming. */
export const RADIO_CITY_MAX_LENGTH = 80;

/**
 * Seconds a beat credits (AC-12): the server's own gap since the stored last
 * beat, capped at forty five seconds, never negative, and nothing at all on a
 * stretch's first beat (`lastBeatAt` undefined). Whole seconds, so the stored
 * figure is an integer and only ever increases.
 */
export function radioBeatCreditSeconds(
  lastBeatAt: number | undefined,
  now: number,
): number {
  if (lastBeatAt === undefined) return 0;
  const delta = Math.min(Math.max(0, now - lastBeatAt), RADIO_BEAT_CREDIT_CAP_MS);
  return Math.round(delta / 1000);
}

/** A city passed with a beat, trimmed and capped, or undefined when empty. */
export function normalizeRadioCity(city: string | null | undefined): string | undefined {
  const trimmed = city?.trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, RADIO_CITY_MAX_LENGTH);
}

// -- Follows (AC-9, AC-10) ------------------------------------------------

/**
 * A member's effective follow state: their own choice when they made one, else
 * the program's own `followedByDefault`. No surface hardcodes which programs
 * are followed by default (AC-10).
 */
export function effectiveRadioFollow(
  choice: { following: boolean } | null | undefined,
  followedByDefault: boolean,
): boolean {
  return choice ? choice.following : followedByDefault;
}

// -- Recordings (AC-24 to AC-27) ------------------------------------------

/** Each multipart part, 8 MiB (R2 needs at least 5 MiB per part but the last). */
export const RADIO_RECORDING_PART_SIZE_BYTES = 8 * 1024 * 1024;

/** The largest recording accepted, 500 MB. */
export const RADIO_RECORDING_MAX_BYTES = 500 * 1024 * 1024;

/** How many part urls the server signs in one call. */
export const RADIO_RECORDING_SIGN_BATCH = 10;

/** A playback url is signed for an hour and re derived each read (AC-27). */
export const RADIO_RECORDING_URL_TTL_SECONDS = 3600;

/** The mobile Recordings segment pages twenty at a time (AC-27). */
export const RADIO_RECORDINGS_PAGE_SIZE = 20;

/** The export hint the upload form shows (AC-25). */
export const RADIO_RECORDING_EXPORT_HINT =
  'Export as MP3, mono, 64 kbps (spoken word). That is about 30 MB an hour.';

/** The fixed root every recording key lives under. */
export const RADIO_RECORDING_KEY_ROOT = 'radio/recordings/';

/** The prefix every key for one broadcast must start with (AC-25). */
export function radioRecordingKeyPrefix(broadcastId: string): string {
  return `${RADIO_RECORDING_KEY_ROOT}${broadcastId}/`;
}

/**
 * True only for a key inside this broadcast's prefix, with a plain file name
 * after it: no further slashes, no `..`, nothing empty. A key that merely
 * starts with the prefix but climbs out of it is refused (AC-25).
 */
export function isRadioRecordingKeyFor(key: string, broadcastId: string): boolean {
  if (!broadcastId || broadcastId.includes('/')) return false;
  const prefix = radioRecordingKeyPrefix(broadcastId);
  if (!key.startsWith(prefix)) return false;
  const rest = key.slice(prefix.length);
  return /^[A-Za-z0-9._-]+$/.test(rest) && rest !== '.' && rest !== '..';
}

/** True for an `audio/*` content type (AC-25). */
export function isRadioAudioContentType(contentType: string): boolean {
  return /^audio\/[a-z0-9.+-]+$/i.test(contentType.trim());
}

/** How many parts a file of `sizeBytes` needs. */
export function radioRecordingPartCount(sizeBytes: number): number {
  return Math.max(1, Math.ceil(sizeBytes / RADIO_RECORDING_PART_SIZE_BYTES));
}

// -- Radio inbox (AC-28 to AC-31) -----------------------------------------

/** A prayer request is anonymous; a testimony carries its sender's name. */
export const RADIO_INBOX_TYPES = ['prayer_request', 'testimony'] as const;
export type RadioInboxType = (typeof RADIO_INBOX_TYPES)[number];

/** The longest an inbox item may be, after trimming (AC-28). */
export const RADIO_INBOX_BODY_MAX_LENGTH = 1000;

/** Both types share one budget of this many submissions per person... */
export const RADIO_INBOX_RATE_LIMIT = 5;

/** ...in any rolling window of this long (AC-28). */
export const RADIO_INBOX_RATE_WINDOW_MS = HOUR_MS;

/** The sentence the send buttons show while nothing is on air (AC-28). */
export const RADIO_INBOX_OFF_AIR_MESSAGE =
  'Prayer requests and testimonies open while a broadcast is on air.';

/**
 * Whether another submission is allowed, given the `createdAt` of the sender's
 * recent items of either type (AC-28).
 */
export function isRadioInboxRateLimited(
  recentCreatedAts: readonly number[],
  now: number,
): boolean {
  const since = now - RADIO_INBOX_RATE_WINDOW_MS;
  return recentCreatedAts.filter((t) => t > since).length >= RADIO_INBOX_RATE_LIMIT;
}

// -- Validators ------------------------------------------------------------

const hostFields = {
  hostUserId: z.string().min(1).optional(),
  hostGuestName: z
    .string()
    .trim()
    .max(RADIO_HOST_GUEST_NAME_MAX_LENGTH)
    .optional(),
};

/**
 * A program as the Programs form submits it (AC-18, AC-22). The mutation runs
 * the same checks itself; this is what lets the form stop the typist first.
 */
export const radioProgramInputSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, 'Give the program a name.')
      .max(RADIO_PROGRAM_NAME_MAX_LENGTH),
    description: z.string().trim().max(RADIO_PROGRAM_DESCRIPTION_MAX_LENGTH),
    days: z.array(z.number().int().min(0).max(6)).refine(isValidRadioDays, {
      message: 'Choose at least one day, each once.',
    }),
    startTime: z.string().refine(isValidRadioStartTime, {
      message: 'Use a 24 hour time like 06:00.',
    }),
    durationMinutes: z.number().refine(isValidRadioDuration, {
      message: `A length from ${RADIO_DURATION_MIN_MINUTES} to ${RADIO_DURATION_MAX_MINUTES} minutes.`,
    }),
    recurrence: z.enum(RADIO_PROGRAM_RECURRENCES),
    recordByDefault: z.boolean(),
    followedByDefault: z.boolean(),
    ...hostFields,
  })
  .refine(isValidRadioHost, {
    message: 'Choose a member or type a guest name, not both.',
    path: ['hostGuestName'],
  });
export type RadioProgramInput = z.infer<typeof radioProgramInputSchema>;

/**
 * A broadcast added by hand (AC-20): a typed one off name or an existing
 * program, never both and never neither, ending after it starts.
 */
export const radioBroadcastByHandSchema = z
  .object({
    oneOffName: z
      .string()
      .trim()
      .min(1)
      .max(RADIO_ONE_OFF_NAME_MAX_LENGTH)
      .optional(),
    programId: z.string().min(1).optional(),
    startsAt: z.number().int(),
    endsAt: z.number().int(),
    isRecorded: z.boolean(),
    ...hostFields,
  })
  .refine((b) => !!b.oneOffName !== !!b.programId, {
    message: 'Type a name or choose a program, not both.',
    path: ['oneOffName'],
  })
  .refine((b) => b.endsAt > b.startsAt, {
    message: 'The end must be after the start.',
    path: ['endsAt'],
  })
  .refine((b) => b.endsAt - b.startsAt <= RADIO_BROADCAST_MAX_MS, {
    message: 'A broadcast can run at most 24 hours.',
    path: ['endsAt'],
  })
  .refine(isValidRadioHost, {
    message: 'Choose a member or type a guest name, not both.',
    path: ['hostGuestName'],
  });
export type RadioBroadcastByHandInput = z.infer<typeof radioBroadcastByHandSchema>;

/** A prayer request or testimony as the phone sends it (AC-28). */
export const radioInboxSubmitSchema = z.object({
  type: z.enum(RADIO_INBOX_TYPES),
  body: z
    .string()
    .trim()
    .min(1, 'Write something first.')
    .max(
      RADIO_INBOX_BODY_MAX_LENGTH,
      `Keep it to ${RADIO_INBOX_BODY_MAX_LENGTH} characters.`,
    ),
});
export type RadioInboxSubmitInput = z.infer<typeof radioInboxSubmitSchema>;

// -- Audit -----------------------------------------------------------------

/** The `activityLogs.action` values this feature writes. */
export const RADIO_FEED_ACTIONS = [
  'radio.override_set',
  'radio.override_cleared',
  'radioProgram.created',
  'radioProgram.updated',
  'radioProgram.activated',
  'radioProgram.deactivated',
  'radioBroadcast.created',
  'radioBroadcast.adjusted',
  'radioBroadcast.cancelled',
  'radioBroadcast.restored',
  'radioBroadcast.renamed',
  'radioRecording.uploaded',
  'radioRecording.replaced',
  'radioRecording.removed',
  'radioInbox.prayed_for',
] as const;
export type RadioFeedAction = (typeof RADIO_FEED_ACTIONS)[number];

/** The `activityLogs.targetType` values, table names per this codebase's convention. */
export const RADIO_TARGET_TYPES = {
  status: 'radioStatus',
  program: 'radioPrograms',
  broadcast: 'radioBroadcasts',
  inboxItem: 'radioInboxItems',
} as const;

// -- Error codes -----------------------------------------------------------

/** Every refusal this feature can produce, so the portal maps each to a sentence. */
export const RADIO_ERROR_CODES = [
  'RADIO_NOT_AUTHORIZED',
  'RADIO_NO_OVERRIDE',
  'RADIO_PROGRAM_NOT_FOUND',
  'RADIO_PROGRAM_NAME_REQUIRED',
  'RADIO_PROGRAM_NAME_TOO_LONG',
  'RADIO_PROGRAM_NAME_TAKEN',
  'RADIO_PROGRAM_DESCRIPTION_TOO_LONG',
  'RADIO_DAYS_INVALID',
  'RADIO_START_TIME_INVALID',
  'RADIO_DURATION_INVALID',
  'RADIO_HOST_AMBIGUOUS',
  'RADIO_HOST_NOT_FOUND',
  'RADIO_SUPER_T_NOT_RECORDED',
  'RADIO_BROADCAST_NOT_FOUND',
  'RADIO_BROADCAST_NAME_AMBIGUOUS',
  'RADIO_BROADCAST_TIMES_INVALID',
  'RADIO_BROADCAST_HAS_RECORDING',
  'RADIO_BROADCAST_NOT_RENAMEABLE',
  'RADIO_TOO_MANY_DEVICES',
  'RADIO_RECORDING_NOT_FINISHED',
  'RADIO_RECORDING_TOO_LARGE',
  'RADIO_RECORDING_TYPE_UNSUPPORTED',
  'RADIO_RECORDING_EXISTS',
  'RADIO_RECORDING_KEY_INVALID',
  'RADIO_RECORDING_UPLOAD_UNKNOWN',
  'RADIO_RECORDING_PART_MISMATCH',
  'RADIO_RECORDING_MISSING',
  'RADIO_INBOX_OFF_AIR',
  'RADIO_INBOX_BODY_REQUIRED',
  'RADIO_INBOX_BODY_TOO_LONG',
  'RADIO_INBOX_RATE_LIMITED',
  'RADIO_INBOX_ITEM_NOT_FOUND',
  'RADIO_INBOX_NOT_PRAYER_REQUEST',
] as const;
export type RadioErrorCode = (typeof RADIO_ERROR_CODES)[number];

/** The sentence each refusal shows, naming the fix rather than the rule. */
export const RADIO_ERROR_MESSAGES: Record<RadioErrorCode, string> = {
  RADIO_NOT_AUTHORIZED: 'Only the Media team can do that.',
  RADIO_NO_OVERRIDE: 'The status is already automatic.',
  RADIO_PROGRAM_NOT_FOUND: 'That program no longer exists.',
  RADIO_PROGRAM_NAME_REQUIRED: 'Give the program a name.',
  RADIO_PROGRAM_NAME_TOO_LONG: `A program name can be at most ${RADIO_PROGRAM_NAME_MAX_LENGTH} characters.`,
  RADIO_PROGRAM_NAME_TAKEN: 'Another active program already has that name.',
  RADIO_PROGRAM_DESCRIPTION_TOO_LONG: `A description can be at most ${RADIO_PROGRAM_DESCRIPTION_MAX_LENGTH} characters.`,
  RADIO_DAYS_INVALID: 'Choose at least one day, each once.',
  RADIO_START_TIME_INVALID: 'Use a 24 hour start time like 06:00.',
  RADIO_DURATION_INVALID: `A length from ${RADIO_DURATION_MIN_MINUTES} to ${RADIO_DURATION_MAX_MINUTES} minutes.`,
  RADIO_HOST_AMBIGUOUS: 'Choose a member or type a guest name, not both.',
  RADIO_HOST_NOT_FOUND: 'That member no longer exists.',
  RADIO_SUPER_T_NOT_RECORDED: 'Super T is never recorded.',
  RADIO_BROADCAST_NOT_FOUND: 'That broadcast no longer exists.',
  RADIO_BROADCAST_NAME_AMBIGUOUS: 'Type a name or choose a program, not both.',
  RADIO_BROADCAST_TIMES_INVALID:
    'The end must be after the start, and a broadcast can run at most 24 hours.',
  RADIO_BROADCAST_HAS_RECORDING:
    'This broadcast already has a recording, so its times can no longer change.',
  RADIO_BROADCAST_NOT_RENAMEABLE:
    'Only a one off or an unscheduled broadcast can be renamed.',
  RADIO_TOO_MANY_DEVICES: `You are listening on more than ${RADIO_MAX_DEVICES_PER_BROADCAST} devices.`,
  RADIO_RECORDING_NOT_FINISHED: 'Upload a recording once the broadcast has finished.',
  RADIO_RECORDING_TOO_LARGE: `A recording can be at most ${Math.round(RADIO_RECORDING_MAX_BYTES / (1024 * 1024))} MB.`,
  RADIO_RECORDING_TYPE_UNSUPPORTED: 'Recordings must be audio files.',
  RADIO_RECORDING_EXISTS:
    'This broadcast already has a recording. Choose replace to upload over it.',
  RADIO_RECORDING_KEY_INVALID: 'That upload does not belong to this broadcast.',
  RADIO_RECORDING_UPLOAD_UNKNOWN: 'That upload has expired. Start it again.',
  RADIO_RECORDING_PART_MISMATCH:
    'Part of the upload did not arrive intact. Try the upload again.',
  RADIO_RECORDING_MISSING: 'This broadcast has no recording.',
  RADIO_INBOX_OFF_AIR: RADIO_INBOX_OFF_AIR_MESSAGE,
  RADIO_INBOX_BODY_REQUIRED: 'Write something first.',
  RADIO_INBOX_BODY_TOO_LONG: `Keep it to ${RADIO_INBOX_BODY_MAX_LENGTH} characters.`,
  RADIO_INBOX_RATE_LIMITED:
    'You have sent several already this hour. Try again a little later.',
  RADIO_INBOX_ITEM_NOT_FOUND: 'That item no longer exists.',
  RADIO_INBOX_NOT_PRAYER_REQUEST: 'Only a prayer request can be marked prayed for.',
};

/** True only for a code this feature defines. */
export function isRadioErrorCode(value: string): value is RadioErrorCode {
  return (RADIO_ERROR_CODES as readonly string[]).includes(value);
}

/** The sentence for a code, or a safe fallback for anything unrecognised. */
export function radioErrorMessage(code: string): string {
  return isRadioErrorCode(code)
    ? RADIO_ERROR_MESSAGES[code]
    : 'Something went wrong. Try again.';
}
