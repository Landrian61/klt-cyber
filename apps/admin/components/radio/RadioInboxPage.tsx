"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { HeartHandshake, Inbox, Sparkles } from "lucide-react";
import {
  formatKampalaDayHeading,
  formatKampalaTime,
  kampalaDateKeyAt,
} from "@klt-cyber/shared";

import { api, type Id } from "@/lib/api";
import { useAuthQuery } from "@/lib/useAuthQuery";
import { Reveal } from "@/components/motion/Reveal";
import { Badge } from "@/components/shadcn/badge";
import { ActionButton } from "@/components/ui/ActionButton";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Heading } from "@/components/ui/Heading";
import { radioError } from "./radioErrors";

type InboxPage = NonNullable<FunctionReturnType<typeof api.radioInbox.listByBroadcast>>;
type Group = InboxPage["groups"][number];
type Item = Group["items"][number];

/**
 * The Radio inbox (spec 0019, AC-29, AC-31, AC-38): prayer requests and
 * testimonies grouped by the broadcast they arrived during, newest broadcast
 * first. A testimony shows its sender's name; a prayer request never shows a
 * sender, because the query never returns one. Media marks prayer requests as
 * prayed for, and Pastoral sees the mark on the same read.
 *
 * Older broadcasts load a page at a time. Each page is its own live query, so
 * a new item or a fresh mark appears without a refresh.
 */
export function RadioInboxPage() {
  // The cursor of every page loaded so far; the first page has none.
  const [cursors, setCursors] = useState<(number | undefined)[]>([undefined]);

  return (
    <div className="space-y-6">
      <div>
        <Heading as="h1" size="xl">
          Radio inbox
        </Heading>
        <p className="font-body text-sm text-on-surface-variant">
          Prayer requests and testimonies sent in during broadcasts. Prayer requests are
          anonymous to everyone; testimonies carry the sender&rsquo;s name.
        </p>
      </div>

      {cursors.map((cursor, index) => (
        <InboxPageSection
          key={cursor ?? "first"}
          cursor={cursor}
          isFirst={index === 0}
          isLast={index === cursors.length - 1}
          onLoadMore={(next) => setCursors((prev) => [...prev, next])}
        />
      ))}
    </div>
  );
}

function InboxPageSection({
  cursor,
  isFirst,
  isLast,
  onLoadMore,
}: {
  cursor: number | undefined;
  isFirst: boolean;
  isLast: boolean;
  onLoadMore: (next: number) => void;
}) {
  const page = useAuthQuery(api.radioInbox.listByBroadcast, cursor === undefined ? {} : { cursor });

  if (page === null) {
    return isFirst ? <ErrorState retry={() => window.location.reload()} /> : null;
  }
  if (page === undefined) {
    return (
      <div className="space-y-3" aria-label="Loading the inbox">
        {[0, 1].map((i) => (
          <div key={i} className="h-32 animate-pulse rounded-xl bg-surface-low" />
        ))}
      </div>
    );
  }
  if (isFirst && page.groups.length === 0) {
    return (
      <EmptyState
        icon={<Inbox className="h-8 w-8" aria-hidden />}
        title="Nothing in the inbox yet"
        message="Prayer requests and testimonies arrive here while a broadcast is on air."
      />
    );
  }

  return (
    <>
      {page.groups.map((group) => (
        <Reveal key={group.broadcast._id}>
          <BroadcastGroup group={group} canMark={page.canMarkPrayedFor} />
        </Reveal>
      ))}
      {isLast && page.nextCursor !== null && (
        <div className="flex justify-center">
          <Button variant="secondary" size="sm" onClick={() => onLoadMore(page.nextCursor!)}>
            Show older broadcasts
          </Button>
        </div>
      )}
    </>
  );
}

function BroadcastGroup({ group, canMark }: { group: Group; canMark: boolean }) {
  const prayers = group.items.filter((i) => i.type === "prayer_request").length;
  const testimonies = group.items.length - prayers;
  return (
    <section className="space-y-3 rounded-xl bg-surface-low p-4 md:p-6">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <Heading as="h2" size="lg">
            {group.broadcast.title}
          </Heading>
          {group.broadcast.startsAt > 0 && (
            <p className="font-body text-xs text-on-surface-variant">
              {formatKampalaDayHeading(kampalaDateKeyAt(group.broadcast.startsAt))} ·{" "}
              <span className="font-mono">{formatKampalaTime(group.broadcast.startsAt)}</span>
            </p>
          )}
        </div>
        <p className="font-body text-xs text-on-surface-variant">
          <span className="font-mono">{prayers}</span> prayer{" "}
          {prayers === 1 ? "request" : "requests"} ·{" "}
          <span className="font-mono">{testimonies}</span>{" "}
          {testimonies === 1 ? "testimony" : "testimonies"}
        </p>
      </header>
      <ul className="space-y-2">
        {group.items.map((item) => (
          <InboxItem key={item._id} item={item} canMark={canMark} />
        ))}
      </ul>
    </section>
  );
}

function InboxItem({ item, canMark }: { item: Item; canMark: boolean }) {
  const markPrayedFor = useMutation(api.radioInbox.markPrayedFor);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isPrayer = item.type === "prayer_request";

  async function mark() {
    setBusy(true);
    setError(null);
    try {
      await markPrayedFor({ itemId: item._id as Id<"radioInboxItems"> });
    } catch (caught) {
      setError(radioError(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="space-y-2 rounded-lg bg-surface-lowest p-4 shadow-e1">
      <div className="flex flex-wrap items-center gap-2">
        {isPrayer ? (
          <Badge variant="member">
            <HeartHandshake className="mr-1 h-3.5 w-3.5" aria-hidden />
            Prayer request
          </Badge>
        ) : (
          <Badge variant="role">
            <Sparkles className="mr-1 h-3.5 w-3.5" aria-hidden />
            Testimony
          </Badge>
        )}
        <span className="font-body text-xs text-on-surface-variant">
          {"senderName" in item && item.senderName ? `${item.senderName} · ` : isPrayer ? "Anonymous · " : ""}
          <span className="font-mono">{formatKampalaTime(item.createdAt)}</span>
        </span>
      </div>
      <p className="whitespace-pre-wrap font-body text-sm text-on-surface">{item.body}</p>
      {isPrayer && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          {item.prayedForAt ? (
            <Badge variant="verified">
              Prayed for{item.prayedForByName ? ` by ${item.prayedForByName}` : ""} ·{" "}
              {formatKampalaTime(item.prayedForAt)}
            </Badge>
          ) : canMark ? (
            <ActionButton variant="gold" onClick={() => void mark()} disabled={busy}>
              Mark prayed for
            </ActionButton>
          ) : (
            <Badge variant="pending">Not yet prayed for</Badge>
          )}
          {error && (
            <p role="alert" className="font-body text-xs text-error">
              {error}
            </p>
          )}
        </div>
      )}
    </li>
  );
}
