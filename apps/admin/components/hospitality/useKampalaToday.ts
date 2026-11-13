"use client";

import { useEffect, useState } from "react";
import { kampalaToday } from "@klt-cyber/shared";

/**
 * The browser's Kampala day, moved forward when the date changes while the
 * tab stays open (spec 0025, AC-6). Checked once a minute; the state only
 * changes on a new day, so the queries keyed on it resubscribe once a day.
 */
export function useKampalaToday(): string {
  const [today, setToday] = useState(() => kampalaToday());
  useEffect(() => {
    const timer = setInterval(() => {
      const now = kampalaToday();
      setToday((previous) => (previous === now ? previous : now));
    }, 60_000);
    return () => clearInterval(timer);
  }, []);
  return today;
}
