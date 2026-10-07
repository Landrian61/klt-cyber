"use client";

import { useCallback, useMemo, useState } from "react";
import {
  DASHBOARD_FILTERS_DEFAULT,
  activeDashboardFilterCount,
  type DashboardFilters,
} from "./demographicsUtils";

/**
 * Page-level state for the dashboard's Zone 1 filter bar — the 9 filters
 * from last session's Explore tab, lifted out of a single tab and into
 * `DashboardClient` so every zone (KPIs, charts, roster table) shares one
 * filtered population. See `matchesDashboardFilters` (demographicsUtils.ts)
 * for the predicate this state feeds.
 */
export function useDashboardFilters() {
  const [filters, setFilters] = useState<DashboardFilters>(
    DASHBOARD_FILTERS_DEFAULT,
  );

  const setFilter = useCallback(
    <K extends keyof DashboardFilters>(key: K, value: DashboardFilters[K]) => {
      setFilters((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  const clearFilters = useCallback(() => {
    setFilters(DASHBOARD_FILTERS_DEFAULT);
  }, []);

  const activeCount = useMemo(
    () => activeDashboardFilterCount(filters),
    [filters],
  );

  return { filters, setFilter, clearFilters, activeCount };
}
