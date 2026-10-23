import { useCallback, useEffect, useState } from 'react';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Calendar from 'expo-calendar';

// Putting an event or a group activity into the phone's own calendar (spec
// 0010, AC-9 and AC-10).
//
// The member already lives by their calendar, so this is the one place the app
// hands content over to the operating system. What it writes is a COPY: if the
// event later moves or is called off, the calendar keeps the old time and the
// push is what tells them otherwise. That is a known limitation, recorded in
// the spec's consequences, not an oversight.

/** Everything written to the device, so the time cannot be re-derived here. */
export interface CalendarItem {
  kind: 'event' | 'activity';
  id: string;
  title: string;
  startDateTime: number;
  endDateTime: number;
  location?: string;
  description?: string;
}

/**
 * The church's own zone, written explicitly.
 *
 * Without it the entry is created in the device's zone, so a member whose
 * phone is set to London would see the entry an hour or two off what the app
 * just showed them. The app displays Kampala times everywhere, so the calendar
 * copy has to say Kampala too.
 */
const CHURCH_TIME_ZONE = 'Africa/Kampala';

/**
 * Where the created entry's id is remembered, keyed by kind and id.
 *
 * On the device and not on the server, on purpose: the same account on a
 * second phone has its own calendar, so "already added" is a fact about this
 * device rather than about the member.
 */
function storageKey(kind: string, id: string): string {
  return `calendar-entry:${kind}:${id}`;
}

export type CalendarState =
  | 'checking'   // reading the device note
  | 'idle'       // not added yet
  | 'working'    // permission prompt or write in flight
  | 'added'      // a note exists for this item
  | 'denied'     // permission refused; nothing was written
  | 'failed';    // something else went wrong; the button stays usable

/**
 * Picks a calendar that can actually be written to.
 *
 * `getDefaultCalendarAsync` is iOS only. On Android it does not exist, so the
 * first calendar that allows modifications is the one to use — without this,
 * an Android write would either throw or land silently nowhere.
 */
async function resolveWritableCalendarId(): Promise<string | null> {
  if (Platform.OS === 'ios') {
    const standard = await Calendar.getDefaultCalendarAsync();
    if (standard?.id) return standard.id;
  }
  const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
  const writable = calendars.find((calendar) => calendar.allowsModifications);
  return writable?.id ?? null;
}

/**
 * Adds `item` to the phone's calendar, once.
 *
 * Returns the state the button should read as. The device note is written
 * BEFORE the member is told it worked, so two fast taps cannot both believe
 * they were first and leave two entries behind.
 */
export function useAddToCalendar(item: CalendarItem | null) {
  const [state, setState] = useState<CalendarState>('checking');
  const kind = item?.kind;
  const id = item?.id;

  useEffect(() => {
    if (!kind || !id) return;
    let active = true;
    AsyncStorage.getItem(storageKey(kind, id))
      .then((stored) => {
        if (active) setState(stored ? 'added' : 'idle');
      })
      // Storage can fail on a device with no space left. Treating that as "not
      // added" is the safer of the two wrong answers: the member can still add
      // it, where a false "added" would leave them with no reminder at all.
      .catch(() => {
        if (active) setState('idle');
      });
    return () => {
      active = false;
    };
    // Keyed on the two primitives this read actually uses, NOT on `item`.
    // Callers build the item as a fresh object literal from a reactive query,
    // so depending on it re-ran this on every render — including the one
    // `setState('working')` causes. The storage read would then resolve to
    // "not added" while createEventAsync was still waiting on the permission
    // prompt, re-enabling the button mid-write and letting a second tap
    // through to a second entry.
  }, [kind, id]);

  const add = useCallback(async () => {
    if (!item || state === 'working' || state === 'added') return;
    setState('working');

    try {
      const existing = await Calendar.getCalendarPermissionsAsync();
      const permission = existing.granted
        ? existing
        : await Calendar.requestCalendarPermissionsAsync();

      if (!permission.granted) {
        // Nothing written, and the state stays recoverable: granting from
        // system settings and tapping again works (AC-10).
        setState('denied');
        return;
      }

      const calendarId = await resolveWritableCalendarId();
      if (!calendarId) {
        setState('failed');
        return;
      }

      const entryId = await Calendar.createEventAsync(calendarId, {
        title: item.title,
        startDate: new Date(item.startDateTime),
        endDate: new Date(item.endDateTime),
        location: item.location,
        notes: item.description,
        timeZone: CHURCH_TIME_ZONE,
      });

      await AsyncStorage.setItem(storageKey(item.kind, item.id), entryId);
      setState('added');
    } catch {
      setState('failed');
    }
  }, [item, state]);

  return { state, add };
}
