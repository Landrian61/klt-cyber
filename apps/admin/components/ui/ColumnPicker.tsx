"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Columns3 } from "lucide-react";
import { Button } from "@/components/shadcn/button";
import { Badge } from "@/components/shadcn/badge";
import { Checkbox } from "@/components/shadcn/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/shadcn/popover";

// Choose which columns a table shows. Pairs with `useColumnVisibility`, which
// remembers the choice in this browser only (a per viewer convenience, so
// localStorage, wrapped so a private window or blocked storage still works).

export interface PickableColumn {
  key: string;
  label: string;
  /** Always shown, never offered as a choice (the row's name, for example). */
  locked?: boolean;
}

export function useColumnVisibility(
  storageKey: string,
  columns: PickableColumn[],
  defaultHidden: string[] = [],
) {
  const defaults = useMemo(
    () =>
      new Set(
        columns.filter((c) => c.locked || !defaultHidden.includes(c.key)).map((c) => c.key),
      ),
    [columns, defaultHidden],
  );
  const [visible, setVisible] = useState<Set<string>>(defaults);

  // Read after mount so the server render and the first client render agree.
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(storageKey);
      if (!saved) return;
      const keys = JSON.parse(saved) as unknown;
      if (!Array.isArray(keys)) return;
      const known = new Set(columns.map((c) => c.key));
      const next = new Set(keys.filter((k): k is string => typeof k === "string" && known.has(k)));
      columns.forEach((c) => c.locked && next.add(c.key));
      setVisible(next);
    } catch {
      // Storage unavailable: keep the defaults.
    }
  }, [storageKey, columns]);

  const update = useCallback(
    (next: Set<string>) => {
      setVisible(next);
      try {
        window.localStorage.setItem(storageKey, JSON.stringify([...next]));
      } catch {
        // Storage unavailable: the choice lasts for this visit only.
      }
    },
    [storageKey],
  );

  return {
    visible,
    isVisible: (key: string) => visible.has(key),
    setColumn: (key: string, on: boolean) => {
      const next = new Set(visible);
      if (on) next.add(key);
      else next.delete(key);
      update(next);
    },
    showAll: () => update(new Set(columns.map((c) => c.key))),
    reset: () => update(new Set(defaults)),
  };
}

export function ColumnPicker({
  columns,
  state,
}: {
  columns: PickableColumn[];
  state: ReturnType<typeof useColumnVisibility>;
}) {
  const choices = columns.filter((c) => !c.locked);
  const hiddenCount = choices.filter((c) => !state.isVisible(c.key)).length;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="secondary" size="sm" className="gap-1.5">
          <Columns3 className="size-4" />
          Columns
          {hiddenCount > 0 && (
            <Badge variant="role" className="ml-1 px-1.5">
              <span className="font-mono">{choices.length - hiddenCount}</span>/
              <span className="font-mono">{choices.length}</span>
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 space-y-3" align="start">
        <div className="flex items-center justify-between">
          <p className="font-body text-sm font-semibold text-on-surface">Show columns</p>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={state.showAll}
              className="font-body text-xs text-primary underline underline-offset-2"
            >
              Show all
            </button>
            <button
              type="button"
              onClick={state.reset}
              className="font-body text-xs text-on-surface-variant underline underline-offset-2"
            >
              Reset
            </button>
          </div>
        </div>
        <ul className="space-y-2">
          {choices.map((column) => {
            const id = `column-${column.key}`;
            return (
              <li key={column.key} className="flex items-center gap-2">
                <Checkbox
                  id={id}
                  checked={state.isVisible(column.key)}
                  onCheckedChange={(on) => state.setColumn(column.key, on === true)}
                />
                <label htmlFor={id} className="font-body text-sm text-on-surface">
                  {column.label}
                </label>
              </li>
            );
          })}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
