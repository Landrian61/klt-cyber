"use client";

import type { ReactNode } from "react";
import {
  formatKampalaDayHeading,
  formatKampalaTime,
  kampalaDateKeyAt,
} from "@klt-cyber/shared";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/shadcn/dialog";
import { Badge } from "@/components/shadcn/badge";
import type { GroupItem } from "./types";

// A department or clan activity, read only (spec 0021, AC-21). It belongs to
// that group, which edits and cancels it from its own portal; the planner only
// shows it so Administration can plan around it. Never the edit dialog.

function churchWhen(instant: number) {
  return `${formatKampalaDayHeading(kampalaDateKeyAt(instant))}, ${formatKampalaTime(instant)}`;
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="font-body text-xs uppercase tracking-wide text-outline">{label}</dt>
      <dd className="mt-1 font-body text-sm text-on-surface">{children}</dd>
    </div>
  );
}

export function GroupActivityDetail({
  item,
  onOpenChange,
}: {
  item: GroupItem | null;
  onOpenChange: (open: boolean) => void;
}) {
  const activity = item?.activity;
  return (
    <Dialog open={item !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className={activity?.cancelled ? "text-error line-through" : undefined}>
            {activity?.title}
          </DialogTitle>
          <DialogDescription>
            {activity?.ownerType === "clan" ? "Clan" : "Department"} activity, view only.
          </DialogDescription>
        </DialogHeader>
        {activity && (
          <dl className="space-y-4">
            <Row label={activity.ownerType === "clan" ? "Clan" : "Department"}>
              {activity.ownerName}
            </Row>
            {activity.cancelled && (
              <Row label="Status">
                <Badge variant="rejected">Cancelled</Badge>
              </Row>
            )}
            <Row label="Starts">
              <span className="font-mono">{churchWhen(activity.startDateTime)}</span>
            </Row>
            <Row label="Ends">
              <span className="font-mono">{churchWhen(activity.endDateTime)}</span>
            </Row>
            {activity.location && <Row label="Location">{activity.location}</Row>}
          </dl>
        )}
        <p className="font-body text-xs text-outline">
          Times are church time (Kampala). Only {activity?.ownerName ?? "the group"} can
          change this.
        </p>
      </DialogContent>
    </Dialog>
  );
}
