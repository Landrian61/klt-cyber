"use client";

import { useSyncExternalStore } from "react";
import { useMutation } from "convex/react";
import {
  addDaysToDateKey,
  dateKeyFromMs,
  parseYouTubeVideoId,
} from "@klt-cyber/shared";
import { useAuthQuery } from "@/lib/useAuthQuery";
import { api } from "@/lib/api";

// Data layer for Devotionals and Past events.
//
// Mock mode (the default) keeps data in this browser's localStorage so the
// screens can be built and checked before the Convex functions exist. Once
// they are merged, set NEXT_PUBLIC_MEDIA_MOCK=false in .env.local and restart
// the dev server; the pages then call Convex through the same hooks below.

const USE_MOCK = process.env.NEXT_PUBLIC_MEDIA_MOCK !== "false";

// ── Types (shape of the Convex documents) ────────────────────────────────────

export interface Devotional {
  _id: string;
  _creationTime: number;
  title: string;
  scriptureReference: string;
  body: string;
  date: string; // "YYYY-MM-DD", East Africa Time
  createdAt: number;
  updatedAt: number;
}

export interface PastEvent {
  _id: string;
  _creationTime: number;
  title: string;
  date: string; // "YYYY-MM-DD"
  youtubeUrl: string;
  youtubeVideoId: string;
  createdAt: number;
  updatedAt: number;
}

export interface DevotionalFields {
  title: string;
  scriptureReference: string;
  body: string;
  date: string;
}

export interface PastEventFields {
  title: string;
  date: string;
  youtubeUrl: string;
}

export interface DevotionalActions {
  create(fields: DevotionalFields): Promise<void>;
  update(id: string, fields: DevotionalFields): Promise<void>;
  remove(id: string): Promise<void>;
}

export interface PastEventActions {
  create(fields: PastEventFields): Promise<void>;
  update(id: string, fields: PastEventFields): Promise<void>;
  remove(id: string): Promise<void>;
}

// ── Mock store (localStorage, newest date first) ─────────────────────────────

function sortByDateDesc<T extends { date: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => b.date.localeCompare(a.date));
}

function newId(): string {
  return `mock-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function createStore<T extends { date: string }>(
  storageKey: string,
  seed: () => T[],
) {
  let items: T[] | undefined;
  const listeners = new Set<() => void>();

  function read(): T[] {
    if (items !== undefined) return items;
    let loaded: T[];
    try {
      const raw = window.localStorage.getItem(storageKey);
      loaded = raw ? (JSON.parse(raw) as T[]) : seed();
    } catch {
      loaded = seed();
    }
    items = sortByDateDesc(loaded);
    return items;
  }

  function write(next: T[]) {
    items = sortByDateDesc(next);
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(items));
    } catch {
      // Storage can be full or blocked; the in-memory copy still works.
    }
    listeners.forEach((listener) => listener());
  }

  function subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }

  function useItems(): T[] | undefined {
    return useSyncExternalStore<T[] | undefined>(
      subscribe,
      read,
      () => undefined, // server render: show the loading state
    );
  }

  return { read, write, useItems };
}

function seedDevotionals(): Devotional[] {
  const now = Date.now();
  const today = dateKeyFromMs(now);
  const sample = (
    offset: number,
    title: string,
    scriptureReference: string,
    body: string,
  ): Devotional => ({
    _id: `mock-seed-${offset}`,
    _creationTime: now,
    title,
    scriptureReference,
    body,
    date: addDaysToDateKey(today, offset),
    createdAt: now,
    updatedAt: now,
  });
  return [
    sample(
      -1,
      "Rest in His peace",
      "Matthew 11:28",
      "Come to Me, all who are weary and burdened, and I will give you rest.",
    ),
    sample(
      0,
      "Walking in faith",
      "Hebrews 11:1",
      "Now faith is confidence in what we hope for and assurance about what we do not see.",
    ),
    sample(
      2,
      "A thankful heart",
      "1 Thessalonians 5:18",
      "Give thanks in all circumstances; for this is God's will for you.",
    ),
  ];
}

const devotionalStore = createStore<Devotional>(
  "klt.mock.devotionals",
  seedDevotionals,
);
const pastEventStore = createStore<PastEvent>("klt.mock.pastEvents", () => []);

// ── Mock actions (mirror the server's rules) ─────────────────────────────────

function assertDevotionalDateFree(date: string, ignoreId?: string) {
  const clash = devotionalStore
    .read()
    .find((d) => d.date === date && d._id !== ignoreId);
  if (clash) {
    throw new Error(
      `A devotional already exists for ${date}: "${clash.title}"`,
    );
  }
}

const mockDevotionalActions: DevotionalActions = {
  async create(fields) {
    assertDevotionalDateFree(fields.date);
    const now = Date.now();
    devotionalStore.write([
      ...devotionalStore.read(),
      {
        _id: newId(),
        _creationTime: now,
        createdAt: now,
        updatedAt: now,
        ...fields,
      },
    ]);
  },
  async update(id, fields) {
    const current = devotionalStore.read();
    if (!current.some((d) => d._id === id))
      throw new Error("Devotional not found");
    assertDevotionalDateFree(fields.date, id);
    devotionalStore.write(
      current.map((d) =>
        d._id === id ? { ...d, ...fields, updatedAt: Date.now() } : d,
      ),
    );
  },
  async remove(id) {
    const current = devotionalStore.read();
    if (!current.some((d) => d._id === id))
      throw new Error("Devotional not found");
    devotionalStore.write(current.filter((d) => d._id !== id));
  },
};

function videoIdOrThrow(url: string): string {
  const id = parseYouTubeVideoId(url);
  if (!id) throw new Error("Enter a link to a single YouTube video");
  return id;
}

const mockPastEventActions: PastEventActions = {
  async create(fields) {
    const youtubeVideoId = videoIdOrThrow(fields.youtubeUrl);
    const now = Date.now();
    pastEventStore.write([
      ...pastEventStore.read(),
      {
        _id: newId(),
        _creationTime: now,
        createdAt: now,
        updatedAt: now,
        ...fields,
        youtubeVideoId,
      },
    ]);
  },
  async update(id, fields) {
    const current = pastEventStore.read();
    if (!current.some((e) => e._id === id))
      throw new Error("Past event not found");
    const youtubeVideoId = videoIdOrThrow(fields.youtubeUrl);
    pastEventStore.write(
      current.map((e) =>
        e._id === id
          ? { ...e, ...fields, youtubeVideoId, updatedAt: Date.now() }
          : e,
      ),
    );
  },
  async remove(id) {
    const current = pastEventStore.read();
    if (!current.some((e) => e._id === id))
      throw new Error("Past event not found");
    pastEventStore.write(current.filter((e) => e._id !== id));
  },
};

// ── Real hooks (used when NEXT_PUBLIC_MEDIA_MOCK=false) ──────────────────────
// `api` is cast to any so this file compiles before the Convex functions
// exist. Once they are merged, replace the casts with the typed api.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const realApi = api as any;

function useRealDevotionalList(): Devotional[] | null | undefined {
  return useAuthQuery(realApi.devotionals.listDevotionals, {}) as
    Devotional[] | null | undefined;
}

function useRealDevotionalActions(): DevotionalActions {
  const createFn = useMutation(realApi.devotionals.createDevotional);
  const updateFn = useMutation(realApi.devotionals.updateDevotional);
  const removeFn = useMutation(realApi.devotionals.deleteDevotional);
  return {
    create: async (fields) => {
      await createFn(fields);
    },
    update: async (id, fields) => {
      await updateFn({ devotionalId: id, ...fields });
    },
    remove: async (id) => {
      await removeFn({ devotionalId: id });
    },
  };
}

function useRealPastEventList(): PastEvent[] | null | undefined {
  return useAuthQuery(realApi.pastEvents.listPastEvents, {}) as
    PastEvent[] | null | undefined;
}

function useRealPastEventActions(): PastEventActions {
  const createFn = useMutation(realApi.pastEvents.createPastEvent);
  const updateFn = useMutation(realApi.pastEvents.updatePastEvent);
  const removeFn = useMutation(realApi.pastEvents.deletePastEvent);
  return {
    create: async (fields) => {
      await createFn(fields);
    },
    update: async (id, fields) => {
      await updateFn({ pastEventId: id, ...fields });
    },
    remove: async (id) => {
      await removeFn({ pastEventId: id });
    },
  };
}

// ── Public hooks: the pages only ever import these ───────────────────────────

export const useDevotionalList: () => Devotional[] | null | undefined = USE_MOCK
  ? devotionalStore.useItems
  : useRealDevotionalList;

export const useDevotionalActions: () => DevotionalActions = USE_MOCK
  ? () => mockDevotionalActions
  : useRealDevotionalActions;

export const usePastEventList: () => PastEvent[] | null | undefined = USE_MOCK
  ? pastEventStore.useItems
  : useRealPastEventList;

export const usePastEventActions: () => PastEventActions = USE_MOCK
  ? () => mockPastEventActions
  : useRealPastEventActions;

/** Shown on the pages while the mock is active, so nobody mistakes it for real data. */
export function MockDataNotice() {
  if (!USE_MOCK) return null;
  return (
    <p
      role="note"
      className="rounded-md bg-surface-low px-4 py-2 font-body text-xs text-on-surface-variant"
    >
      Preview mode: changes are saved in this browser only, not on the server.
    </p>
  );
}
