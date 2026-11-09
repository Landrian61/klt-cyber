"use client";

import {
  RE_MINUTES_PER_DAY,
  RE_WEEKDAY_DISPLAY_ORDER,
  RE_WEEKDAY_LABELS,
  emptyOpeningHours,
  type RealEstateOpeningHoursEntry,
} from "@klt-cyber/shared";

import { Switch } from "@/components/shadcn/switch";
import { TimePicker } from "@/components/ui/TimePicker";

/** Minutes from midnight as the `"HH:mm"` a `TimePicker` reads. */
function toClock(minutes: number | undefined): string {
  if (minutes === undefined) return "";
  const safe =
    ((minutes % RE_MINUTES_PER_DAY) + RE_MINUTES_PER_DAY) % RE_MINUTES_PER_DAY;
  const hours = Math.floor(safe / 60);
  const mins = safe % 60;
  return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
}

/** `"09:30"` back to minutes from midnight, or undefined when cleared. */
function toMinutes(clock: string): number | undefined {
  const match = /^(\d{1,2}):(\d{2})$/.exec(clock);
  if (!match) return undefined;
  return Number(match[1]) * 60 + Number(match[2]);
}

/**
 * The seven-weekday opening hours editor (spec 0018, AC-10).
 *
 * A new form pattern for this portal: nothing existing edits a seven-entry
 * schedule, so there was nothing to reuse.
 *
 * Two deliberate choices worth knowing about:
 *
 * 1. The week READS Monday first, because that is how a Ugandan week is read,
 *    while the entries STORE Sunday as weekday 0 to match `getDay()`. The
 *    reordering happens only here, in the display, so no conversion layer sits
 *    between the stored data and the clock that reads it.
 *
 * 2. A close EARLIER than its open is allowed and labelled, not corrected. A
 *    facility open 10:00 pm to 2:00 am is a real thing, and silently swapping
 *    the two would turn a night shift into a sixteen-hour day.
 */
export function OpeningHoursEditor({
  value,
  onChange,
  disabled,
}: {
  value: RealEstateOpeningHoursEntry[];
  onChange: (value: RealEstateOpeningHoursEntry[]) => void;
  disabled?: boolean;
}) {
  // A short array from an older row still edits cleanly: fall back to seven
  // closed days rather than rendering a partial week.
  const entries = value.length === 7 ? value : emptyOpeningHours();
  const byWeekday = new Map(entries.map((entry) => [entry.weekday, entry]));

  function update(weekday: number, patch: Partial<RealEstateOpeningHoursEntry>) {
    onChange(
      entries.map((entry) =>
        entry.weekday === weekday ? { ...entry, ...patch } : entry,
      ),
    );
  }

  return (
    <div className="space-y-2">
      <ul className="space-y-1.5">
        {RE_WEEKDAY_DISPLAY_ORDER.map((weekday) => {
          const entry =
            byWeekday.get(weekday) ?? { weekday, closed: true };
          const overnight =
            !entry.closed &&
            entry.openMinutes !== undefined &&
            entry.closeMinutes !== undefined &&
            entry.closeMinutes < entry.openMinutes;

          return (
            <li
              key={weekday}
              className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg bg-surface-low px-3 py-2"
            >
              <span className="w-24 shrink-0 font-body text-sm text-on-surface">
                {RE_WEEKDAY_LABELS[weekday]}
              </span>

              <label className="flex shrink-0 items-center gap-2">
                <Switch
                  id={`open-${weekday}`}
                  checked={!entry.closed}
                  disabled={disabled}
                  onCheckedChange={(open) =>
                    update(
                      weekday,
                      open
                        ? {
                            closed: false,
                            // Sensible first guess so an operator toggling a
                            // day open is not handed two empty pickers.
                            openMinutes: entry.openMinutes ?? 9 * 60,
                            closeMinutes: entry.closeMinutes ?? 17 * 60,
                          }
                        : {
                            closed: true,
                            openMinutes: undefined,
                            closeMinutes: undefined,
                          },
                    )
                  }
                />
                <span className="font-body text-xs text-on-surface-variant">
                  {entry.closed ? "Closed" : "Open"}
                </span>
              </label>

              {!entry.closed && (
                <div className="flex flex-wrap items-center gap-2">
                  <TimePicker
                    id={`from-${weekday}`}
                    value={toClock(entry.openMinutes)}
                    minuteStep={15}
                    disabled={disabled}
                    placeholder="Opens"
                    onChange={(clock) =>
                      update(weekday, { openMinutes: toMinutes(clock) })
                    }
                  />
                  <span className="font-body text-xs text-on-surface-variant">
                    to
                  </span>
                  <TimePicker
                    id={`to-${weekday}`}
                    value={toClock(entry.closeMinutes)}
                    minuteStep={15}
                    disabled={disabled}
                    placeholder="Closes"
                    onChange={(clock) =>
                      update(weekday, { closeMinutes: toMinutes(clock) })
                    }
                  />
                  {overnight && (
                    <span className="font-body text-xs text-primary">
                      runs past midnight
                    </span>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <p className="font-body text-xs text-on-surface-variant">
        Marking every day closed says the facility is genuinely never open, so
        the app reads &ldquo;Closed&rdquo;. If you simply do not know the hours
        yet, turn the whole schedule off above instead and the app reads
        &ldquo;Hours not listed&rdquo;. For a facility that never shuts, set
        12:00 am to 11:45 pm.
      </p>
    </div>
  );
}
