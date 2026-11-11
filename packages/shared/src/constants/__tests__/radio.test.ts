import { describe, expect, it } from 'vitest';

import {
  formatKampalaDayHeading,
  RADIO_BEAT_CREDIT_CAP_MS,
  RADIO_ERROR_CODES,
  RADIO_ERROR_MESSAGES,
  RADIO_INBOX_BODY_MAX_LENGTH,
  RADIO_INBOX_RATE_LIMIT,
  RADIO_INTERRUPTED_GRACE_MS,
  RADIO_SEED_KEYS,
  RADIO_SEED_PROGRAMS,
  RADIO_STALE_PROBE_MS,
  SUPER_T_SEED_KEY,
  deriveRadioStatus,
  effectiveRadioFollow,
  formatKampalaTime,
  formatRadioCountdown,
  formatRadioDuration,
  groupBroadcastsByKampalaDay,
  isInLivePushWindow,
  isRadioAudioContentType,
  isRadioErrorCode,
  isRadioInboxRateLimited,
  isRadioRecordingKeyFor,
  isSuperTProgram,
  isValidRadioDays,
  isValidRadioDuration,
  isValidRadioHost,
  isValidRadioStartTime,
  kampalaDateKeyAt,
  kampalaDayStartAt,
  normalizeRadioCity,
  radioBeatCreditSeconds,
  radioBroadcastByHandSchema,
  radioErrorMessage,
  radioInboxSubmitSchema,
  radioMaterialiseHorizonEnd,
  radioProgramInputSchema,
  radioProgramNameKey,
  radioProgramOccurrences,
  radioRecordingKeyPrefix,
  radioRecordingPartCount,
  radioScheduleWindow,
  resolveCurrentBroadcast,
  resolveNextBroadcast,
  type RadioBroadcastTiming,
} from '../radio';

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/** A Kampala wall clock instant (UTC+3), so tests read in church time. */
function kla(iso: string): number {
  return Date.parse(`${iso}+03:00`);
}

describe('deriveRadioStatus', () => {
  const now = kla('2026-11-11T10:00:00');

  it('reads Off air when there is no status row yet', () => {
    expect(deriveRadioStatus(null, now)).toBe('off_air');
  });

  it('reads Live on a fresh live probe', () => {
    expect(
      deriveRadioStatus({ detected: 'live', lastProbeAt: now - 10_000, lastLiveAt: now - 10_000 }, now),
    ).toBe('live');
  });

  it('reads Interrupted with no source four minutes after the last live reading', () => {
    expect(
      deriveRadioStatus({ detected: 'off_air', lastProbeAt: now - 5_000, lastLiveAt: now - 4 * MIN }, now),
    ).toBe('interrupted');
  });

  it('reads Off air with no source six minutes after the last live reading', () => {
    expect(
      deriveRadioStatus({ detected: 'off_air', lastProbeAt: now - 5_000, lastLiveAt: now - 6 * MIN }, now),
    ).toBe('off_air');
  });

  it('treats the grace as exclusive at exactly five minutes', () => {
    expect(
      deriveRadioStatus(
        { detected: 'off_air', lastProbeAt: now, lastLiveAt: now - RADIO_INTERRUPTED_GRACE_MS },
        now,
      ),
    ).toBe('off_air');
  });

  it('reads Interrupted when the stream is unreachable inside the grace', () => {
    expect(
      deriveRadioStatus({ detected: 'unknown', lastProbeAt: now, lastLiveAt: now - MIN }, now),
    ).toBe('interrupted');
  });

  it('reads Off air on a stale probe even when it last read live', () => {
    expect(
      deriveRadioStatus({ detected: 'live', lastProbeAt: now - 4 * MIN, lastLiveAt: now - 4 * MIN }, now),
    ).toBe('off_air');
    expect(
      deriveRadioStatus(
        { detected: 'live', lastProbeAt: now - RADIO_STALE_PROBE_MS, lastLiveAt: now },
        now,
      ),
    ).toBe('live');
  });

  it('lets an override win in every case', () => {
    const interrupted = { detected: 'off_air' as const, lastProbeAt: now, lastLiveAt: now - 4 * MIN };
    const stale = { detected: 'live' as const, lastProbeAt: now - 10 * MIN };
    expect(deriveRadioStatus({ ...interrupted, override: { state: 'live' } }, now)).toBe('live');
    expect(deriveRadioStatus({ ...stale, override: { state: 'live' } }, now)).toBe('live');
    expect(deriveRadioStatus({ ...interrupted, override: { state: 'off_air' } }, now)).toBe('off_air');
  });
});

describe('program field checks', () => {
  it('keys names trimmed and lowercased', () => {
    expect(radioProgramNameKey('  Morning Glory ')).toBe('morning glory');
    expect(radioProgramNameKey('MORNING GLORY')).toBe(radioProgramNameKey('morning glory'));
  });

  it('accepts only 24 hour HH:MM start times', () => {
    expect(isValidRadioStartTime('06:00')).toBe(true);
    expect(isValidRadioStartTime('23:59')).toBe(true);
    expect(isValidRadioStartTime('24:00')).toBe(false);
    expect(isValidRadioStartTime('6:00')).toBe(false);
    expect(isValidRadioStartTime('06:60')).toBe(false);
  });

  it('accepts whole minute lengths from 1 to 1440', () => {
    expect(isValidRadioDuration(1)).toBe(true);
    expect(isValidRadioDuration(1440)).toBe(true);
    expect(isValidRadioDuration(0)).toBe(false);
    expect(isValidRadioDuration(1441)).toBe(false);
    expect(isValidRadioDuration(30.5)).toBe(false);
  });

  it('accepts weekday arrays with no repeats', () => {
    expect(isValidRadioDays([1, 3, 4, 5])).toBe(true);
    expect(isValidRadioDays([])).toBe(false);
    expect(isValidRadioDays([1, 1])).toBe(false);
    expect(isValidRadioDays([7])).toBe(false);
  });

  it('refuses a host with both fields set', () => {
    expect(isValidRadioHost({})).toBe(true);
    expect(isValidRadioHost({ hostUserId: 'u1' })).toBe(true);
    expect(isValidRadioHost({ hostGuestName: 'Guest' })).toBe(true);
    expect(isValidRadioHost({ hostUserId: 'u1', hostGuestName: '  ' })).toBe(true);
    expect(isValidRadioHost({ hostUserId: 'u1', hostGuestName: 'Guest' })).toBe(false);
  });
});

describe('the seeded programs', () => {
  it('seeds exactly the eight R2-01 programs, one per seed key', () => {
    expect(RADIO_SEED_PROGRAMS.map((p) => p.seedKey).sort()).toEqual([...RADIO_SEED_KEYS].sort());
  });

  it('carries valid timing on every program', () => {
    for (const p of RADIO_SEED_PROGRAMS) {
      expect(isValidRadioDays(p.days)).toBe(true);
      expect(isValidRadioStartTime(p.startTime)).toBe(true);
      expect(isValidRadioDuration(p.durationMinutes)).toBe(true);
    }
  });

  it('has no two names with the same key', () => {
    const keys = RADIO_SEED_PROGRAMS.map((p) => radioProgramNameKey(p.name));
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('follows the three services by default and nothing else', () => {
    const followed = RADIO_SEED_PROGRAMS.filter((p) => p.followedByDefault).map((p) => p.seedKey);
    expect(followed.sort()).toEqual(['english-service', 'luganda-service', 'midweek-service']);
  });

  it('runs Super T a full day from 6AM Tuesday, never recorded', () => {
    const superT = RADIO_SEED_PROGRAMS.find((p) => p.seedKey === SUPER_T_SEED_KEY)!;
    expect(superT).toMatchObject({ days: [2], startTime: '06:00', durationMinutes: 1440 });
    expect(superT.recordByDefault).toBe(false);
    expect(superT.followedByDefault).toBe(false);
    expect(isSuperTProgram(superT)).toBe(true);
    expect(isSuperTProgram({ seedKey: 'morning-glory' })).toBe(false);
    expect(isSuperTProgram({})).toBe(false);
  });

  it('marks only Holy Ghost Night occasional', () => {
    const occasional = RADIO_SEED_PROGRAMS.filter((p) => p.recurrence === 'occasional');
    expect(occasional.map((p) => p.seedKey)).toEqual(['holy-ghost-night']);
  });

  it('seeds the times the SRS and the build settled', () => {
    const byKey = Object.fromEntries(RADIO_SEED_PROGRAMS.map((p) => [p.seedKey, p]));
    expect(byKey['morning-glory']).toMatchObject({ days: [1, 3, 4, 5], startTime: '06:00', durationMinutes: 60 });
    expect(byKey['midweek-service']).toMatchObject({ days: [3], startTime: '16:00', durationMinutes: 120 });
    expect(byKey['tongues-of-fire']).toMatchObject({ days: [5], startTime: '23:00', durationMinutes: 180 });
    expect(byKey['holy-ghost-night']).toMatchObject({ days: [5], startTime: '20:00', durationMinutes: 540 });
    expect(byKey['early-riser']).toMatchObject({ days: [0], startTime: '04:00', durationMinutes: 240 });
    expect(byKey['english-service']).toMatchObject({ days: [0], startTime: '08:00', durationMinutes: 150 });
    expect(byKey['luganda-service']).toMatchObject({ days: [0], startTime: '10:30', durationMinutes: 150 });
  });
});

describe('Kampala day arithmetic', () => {
  it('starts the day at Kampala midnight, not UTC midnight', () => {
    // 01:00 Kampala on the 12th is 22:00 UTC on the 11th.
    const t = kla('2026-11-12T01:00:00');
    expect(kampalaDateKeyAt(t)).toBe('2026-11-12');
    expect(kampalaDayStartAt(t)).toBe(kla('2026-11-12T00:00:00'));
  });

  it('ends the horizon at the end of the Kampala day seven days out', () => {
    // The 00:30 Kampala run on Wednesday 11 Nov writes up to the end of Wed 18 Nov.
    expect(radioMaterialiseHorizonEnd(kla('2026-11-11T00:30:00'))).toBe(kla('2026-11-19T00:00:00'));
  });
});

describe('radioProgramOccurrences', () => {
  const from = kla('2026-11-09T00:00:00'); // Monday
  const to = kla('2026-11-16T00:00:00'); // next Monday

  it('expands Morning Glory on its four weekdays', () => {
    const mg = RADIO_SEED_PROGRAMS.find((p) => p.seedKey === 'morning-glory')!;
    const rows = radioProgramOccurrences(mg, from, to);
    expect(rows.map((r) => kampalaDateKeyAt(r.startsAt))).toEqual([
      '2026-11-09',
      '2026-11-11',
      '2026-11-12',
      '2026-11-13',
    ]);
    expect(rows[0]).toEqual({ startsAt: kla('2026-11-09T06:00:00'), endsAt: kla('2026-11-09T07:00:00') });
  });

  it('lets Tongues of Fire cross midnight into Saturday', () => {
    const tof = RADIO_SEED_PROGRAMS.find((p) => p.seedKey === 'tongues-of-fire')!;
    const [row] = radioProgramOccurrences(tof, from, to);
    expect(row).toEqual({ startsAt: kla('2026-11-13T23:00:00'), endsAt: kla('2026-11-14T02:00:00') });
    expect(kampalaDateKeyAt(row.startsAt)).toBe('2026-11-13');
  });

  it('gives Super T one full day row, not two', () => {
    const superT = RADIO_SEED_PROGRAMS.find((p) => p.seedKey === SUPER_T_SEED_KEY)!;
    const rows = radioProgramOccurrences(superT, from, to);
    expect(rows).toEqual([
      { startsAt: kla('2026-11-10T06:00:00'), endsAt: kla('2026-11-11T06:00:00') },
    ]);
  });

  it('never writes an occasional program ahead', () => {
    const hgn = RADIO_SEED_PROGRAMS.find((p) => p.seedKey === 'holy-ghost-night')!;
    expect(radioProgramOccurrences(hgn, from, to)).toEqual([]);
  });

  it('keeps only starts inside [from, to)', () => {
    const mg = RADIO_SEED_PROGRAMS.find((p) => p.seedKey === 'morning-glory')!;
    // From 06:30 Monday: Monday's 06:00 airing has already started, so it is out.
    const rows = radioProgramOccurrences(mg, kla('2026-11-09T06:30:00'), kla('2026-11-11T06:00:00'));
    expect(rows).toEqual([]);
  });

  it('is deterministic, so a second run yields the same instants', () => {
    const mg = RADIO_SEED_PROGRAMS.find((p) => p.seedKey === 'morning-glory')!;
    expect(radioProgramOccurrences(mg, from, to)).toEqual(radioProgramOccurrences(mg, from, to));
  });
});

describe('current and next broadcast', () => {
  const now = kla('2026-11-10T12:00:00');
  const b = (over: Partial<RadioBroadcastTiming> & { id: string }): RadioBroadcastTiming & { id: string } => ({
    startsAt: now - HOUR,
    endsAt: now + HOUR,
    status: 'scheduled',
    origin: 'scheduled',
    ...over,
  });

  it('finds nothing when nothing covers now', () => {
    expect(resolveCurrentBroadcast([b({ id: 'a', startsAt: now + MIN })], now)).toBeNull();
  });

  it('never treats a cancelled broadcast as current', () => {
    expect(resolveCurrentBroadcast([b({ id: 'a', status: 'cancelled' })], now)).toBeNull();
  });

  it('prefers a scheduled row over an auto row', () => {
    const rows = [b({ id: 'auto', origin: 'auto', startsAt: now - MIN }), b({ id: 'sched' })];
    expect(resolveCurrentBroadcast(rows, now)?.id).toBe('sched');
  });

  it('prefers the later start among equals, so a show inside Super T wins', () => {
    const rows = [
      b({ id: 'superT', startsAt: now - 6 * HOUR, endsAt: now + 18 * HOUR }),
      b({ id: 'oneOff', origin: 'oneOff', startsAt: now - 10 * MIN }),
    ];
    expect(resolveCurrentBroadcast(rows, now)?.id).toBe('oneOff');
  });

  it('treats endsAt as exclusive', () => {
    expect(resolveCurrentBroadcast([b({ id: 'a', endsAt: now })], now)).toBeNull();
  });

  it('picks the earliest non cancelled future start as next', () => {
    const rows = [
      b({ id: 'later', startsAt: now + 2 * HOUR }),
      b({ id: 'cancelled', startsAt: now + HOUR, status: 'cancelled' }),
      b({ id: 'soon', startsAt: now + 90 * MIN }),
      b({ id: 'current' }),
    ];
    expect(resolveNextBroadcast(rows, now)?.id).toBe('soon');
  });
});

describe('isInLivePushWindow', () => {
  const startsAt = kla('2026-11-11T06:00:00');
  const row = { startsAt, endsAt: startsAt + HOUR, status: 'scheduled' as const };

  it('stays shut during a soundcheck twenty minutes early', () => {
    expect(isInLivePushWindow(row, startsAt - 20 * MIN)).toBe(false);
  });

  it('opens fifteen minutes before the start and shuts at the end', () => {
    expect(isInLivePushWindow(row, startsAt - 15 * MIN)).toBe(true);
    expect(isInLivePushWindow(row, startsAt + 59 * MIN)).toBe(true);
    expect(isInLivePushWindow(row, startsAt + HOUR)).toBe(false);
  });

  it('never opens for a cancelled broadcast', () => {
    expect(isInLivePushWindow({ ...row, status: 'cancelled' }, startsAt)).toBe(false);
  });
});

describe('the seven day schedule', () => {
  it('reads back far enough to find one still running from yesterday', () => {
    const now = kla('2026-11-11T05:00:00');
    const { readFrom, until } = radioScheduleWindow(now);
    // Super T began 06:00 Tuesday and is still on at 05:00 Wednesday.
    expect(readFrom).toBeLessThanOrEqual(kla('2026-11-10T06:00:00'));
    expect(until).toBe(now + 7 * DAY);
  });

  it('groups by the Kampala day each broadcast starts on', () => {
    const groups = groupBroadcastsByKampalaDay([
      { id: 'sat', startsAt: kla('2026-11-14T08:00:00') },
      { id: 'fri-late', startsAt: kla('2026-11-13T23:00:00') },
      { id: 'fri', startsAt: kla('2026-11-13T06:00:00') },
    ]);
    expect(groups.map((g) => [g.dateKey, g.items.map((i) => i.id)])).toEqual([
      ['2026-11-13', ['fri', 'fri-late']],
      ['2026-11-14', ['sat']],
    ]);
  });
});

describe('formatters', () => {
  it('prints Kampala wall clock times', () => {
    expect(formatKampalaTime(kla('2026-11-11T06:00:00'))).toBe('6:00 AM');
    expect(formatKampalaTime(kla('2026-11-11T00:05:00'))).toBe('12:05 AM');
    expect(formatKampalaTime(kla('2026-11-11T12:30:00'))).toBe('12:30 PM');
    expect(formatKampalaTime(kla('2026-11-11T23:00:00'))).toBe('11:00 PM');
  });

  it('prints lengths', () => {
    expect(formatRadioDuration(60)).toBe('1h');
    expect(formatRadioDuration(150)).toBe('2h 30m');
    expect(formatRadioDuration(45)).toBe('45m');
    expect(formatRadioDuration(1440)).toBe('24h');
  });

  it('prints countdowns', () => {
    expect(formatRadioCountdown(-5)).toBe('0:00');
    expect(formatRadioCountdown(12 * MIN + 4_000)).toBe('12:04');
    expect(formatRadioCountdown(3 * HOUR + 5 * MIN)).toBe('3h 05m');
    expect(formatRadioCountdown(2 * DAY + 4 * HOUR)).toBe('2d 4h');
  });
});

describe('listening arithmetic', () => {
  const now = 1_000_000_000;

  it('credits nothing on the first beat of a stretch', () => {
    expect(radioBeatCreditSeconds(undefined, now)).toBe(0);
  });

  it('credits the real gap on a normal beat', () => {
    expect(radioBeatCreditSeconds(now - 30_000, now)).toBe(30);
  });

  it('caps a long gap at forty five seconds', () => {
    expect(radioBeatCreditSeconds(now - 10 * MIN, now)).toBe(RADIO_BEAT_CREDIT_CAP_MS / 1000);
  });

  it('never credits a negative amount', () => {
    expect(radioBeatCreditSeconds(now + 5_000, now)).toBe(0);
  });

  it('trims a city and drops an empty one', () => {
    expect(normalizeRadioCity('  Kampala ')).toBe('Kampala');
    expect(normalizeRadioCity('   ')).toBeUndefined();
    expect(normalizeRadioCity(undefined)).toBeUndefined();
  });
});

describe('effectiveRadioFollow', () => {
  it('uses the member choice when there is one, else the program default', () => {
    expect(effectiveRadioFollow(null, true)).toBe(true);
    expect(effectiveRadioFollow(undefined, false)).toBe(false);
    expect(effectiveRadioFollow({ following: false }, true)).toBe(false);
    expect(effectiveRadioFollow({ following: true }, false)).toBe(true);
  });
});

describe('recording keys and limits', () => {
  const id = 'jd7abc123';

  it('builds the per broadcast prefix', () => {
    expect(radioRecordingKeyPrefix(id)).toBe('radio/recordings/jd7abc123/');
  });

  it('accepts a plain file inside the prefix', () => {
    expect(isRadioRecordingKeyFor(`radio/recordings/${id}/a1b2.mp3`, id)).toBe(true);
  });

  it('refuses keys outside the prefix or climbing out of it', () => {
    expect(isRadioRecordingKeyFor(`radio/recordings/other/a.mp3`, id)).toBe(false);
    expect(isRadioRecordingKeyFor(`radio/recordings/${id}/../other/a.mp3`, id)).toBe(false);
    expect(isRadioRecordingKeyFor(`radio/recordings/${id}/sub/a.mp3`, id)).toBe(false);
    expect(isRadioRecordingKeyFor(`radio/recordings/${id}/`, id)).toBe(false);
    expect(isRadioRecordingKeyFor(`radio/recordings/${id}/..`, id)).toBe(false);
    expect(isRadioRecordingKeyFor(`radio/recordings/${id}x/a.mp3`, id)).toBe(false);
    expect(isRadioRecordingKeyFor(`library/${id}/a.mp3`, id)).toBe(false);
  });

  it('accepts only audio content types', () => {
    expect(isRadioAudioContentType('audio/mpeg')).toBe(true);
    expect(isRadioAudioContentType('audio/mp4')).toBe(true);
    expect(isRadioAudioContentType('video/mp4')).toBe(false);
    expect(isRadioAudioContentType('audio/')).toBe(false);
  });

  it('counts parts of 8 MiB', () => {
    expect(radioRecordingPartCount(1)).toBe(1);
    expect(radioRecordingPartCount(8 * 1024 * 1024)).toBe(1);
    expect(radioRecordingPartCount(8 * 1024 * 1024 + 1)).toBe(2);
    expect(radioRecordingPartCount(72 * 1024 * 1024)).toBe(9);
  });
});

describe('the inbox rate limit', () => {
  const now = 10 * HOUR;

  it('allows the fifth and refuses the sixth in a rolling hour', () => {
    const four = [1, 2, 3, 4].map((i) => now - i * MIN);
    expect(isRadioInboxRateLimited(four, now)).toBe(false);
    const five = [...four, now - 5 * MIN];
    expect(five.length).toBe(RADIO_INBOX_RATE_LIMIT);
    expect(isRadioInboxRateLimited(five, now)).toBe(true);
  });

  it('forgets items older than an hour', () => {
    const old = [1, 2, 3, 4, 5].map((i) => now - HOUR - i * MIN);
    expect(isRadioInboxRateLimited(old, now)).toBe(false);
  });
});

describe('validators', () => {
  const program = {
    name: 'Morning Glory',
    description: 'Prayer and the Word.',
    days: [1, 3],
    startTime: '06:00',
    durationMinutes: 60,
    recurrence: 'weekly' as const,
    recordByDefault: true,
    followedByDefault: false,
  };

  it('accepts a valid program and refuses each bad field', () => {
    expect(radioProgramInputSchema.safeParse(program).success).toBe(true);
    expect(radioProgramInputSchema.safeParse({ ...program, name: '  ' }).success).toBe(false);
    expect(radioProgramInputSchema.safeParse({ ...program, startTime: '6am' }).success).toBe(false);
    expect(radioProgramInputSchema.safeParse({ ...program, durationMinutes: 1441 }).success).toBe(false);
    expect(radioProgramInputSchema.safeParse({ ...program, days: [] }).success).toBe(false);
    expect(
      radioProgramInputSchema.safeParse({ ...program, hostUserId: 'u1', hostGuestName: 'Guest' }).success,
    ).toBe(false);
  });

  it('needs exactly one of a name and a program on a broadcast by hand', () => {
    const base = { startsAt: 0, endsAt: HOUR, isRecorded: true };
    expect(radioBroadcastByHandSchema.safeParse({ ...base, oneOffName: 'Crusade' }).success).toBe(true);
    expect(radioBroadcastByHandSchema.safeParse({ ...base, programId: 'p1' }).success).toBe(true);
    expect(radioBroadcastByHandSchema.safeParse(base).success).toBe(false);
    expect(
      radioBroadcastByHandSchema.safeParse({ ...base, oneOffName: 'X', programId: 'p1' }).success,
    ).toBe(false);
  });

  it('refuses a broadcast that ends before it starts or runs past a day', () => {
    expect(
      radioBroadcastByHandSchema.safeParse({ oneOffName: 'X', startsAt: HOUR, endsAt: HOUR, isRecorded: false })
        .success,
    ).toBe(false);
    expect(
      radioBroadcastByHandSchema.safeParse({ oneOffName: 'X', startsAt: 0, endsAt: DAY + 1, isRecorded: false })
        .success,
    ).toBe(false);
  });

  it('caps an inbox body at 1000 characters after trimming', () => {
    const ok = 'a'.repeat(RADIO_INBOX_BODY_MAX_LENGTH);
    expect(radioInboxSubmitSchema.safeParse({ type: 'testimony', body: ok }).success).toBe(true);
    expect(radioInboxSubmitSchema.safeParse({ type: 'testimony', body: `${ok}a` }).success).toBe(false);
    expect(radioInboxSubmitSchema.safeParse({ type: 'prayer_request', body: '   ' }).success).toBe(false);
  });
});

describe('error codes', () => {
  it('has a sentence for every code', () => {
    for (const code of RADIO_ERROR_CODES) {
      expect(RADIO_ERROR_MESSAGES[code].length).toBeGreaterThan(0);
      expect(isRadioErrorCode(code)).toBe(true);
    }
  });

  it('falls back for an unknown code', () => {
    expect(radioErrorMessage('NOPE')).toBe('Something went wrong. Try again.');
  });
});

describe('formatKampalaDayHeading', () => {
  // 23:30 Kampala on Wednesday 11 November 2026, which is still the 11th in
  // Kampala though already 20:30 UTC.
  const lateWednesday = Date.UTC(2026, 10, 11, 20, 30);

  it('names today and tomorrow in Kampala', () => {
    expect(formatKampalaDayHeading('2026-11-11', lateWednesday)).toBe('Today');
    expect(formatKampalaDayHeading('2026-11-12', lateWednesday)).toBe('Tomorrow');
  });

  it('names any other day by weekday, date and month', () => {
    expect(formatKampalaDayHeading('2026-11-13', lateWednesday)).toBe('Friday 13 Nov');
    expect(formatKampalaDayHeading('2026-11-17')).toBe('Tuesday 17 Nov');
  });

  it('rolls to the next day at Kampala midnight, not UTC midnight', () => {
    const justAfterKampalaMidnight = Date.UTC(2026, 10, 11, 21, 1); // 00:01 Thu
    expect(formatKampalaDayHeading('2026-11-12', justAfterKampalaMidnight)).toBe('Today');
  });
});
