import type { MutationCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import { isInLivePushWindow } from "@klt-cyber/shared";
import { sendPushOnly } from "../notifications";

/**
 * N33, the follow push (spec 0019, build slice 7, AC-11).
 *
 * Called only from the probe's own write, and only on a finding of live, so
 * the override (which never reaches the probe) can never send it. Each
 * broadcast is tested and marked in this one transaction, so two probes
 * racing the same transition cannot both send: Convex serialises the two
 * writes to the same row, and the loser sees `livePushSentAt` already set.
 *
 * The probe only marks and SCHEDULES the send; finding the recipients and
 * pushing run in `radio.sendLivePush`, which starts only if the probe's write
 * commits. Doing that work inside the probe meant one failure (or a large
 * users table, for a program followed by default) rolled back the status
 * write itself, and the radio read Off air in the middle of a live broadcast.
 *
 * Mute choices (feature 28) are not stored yet; once they are, a member who
 * muted the radio category is excluded here.
 */

/** Everyone who should hear that this program is live (Value sourcing, N33). */
export async function radioFollowers(
  ctx: MutationCtx,
  program: Doc<"radioPrograms">
): Promise<Id<"users">[]> {
  if (!program.followedByDefault) {
    const following = await ctx.db
      .query("radioProgramFollows")
      .withIndex("by_programId_following", (q) =>
        q.eq("programId", program._id).eq("following", true)
      )
      .collect();
    const out: Id<"users">[] = [];
    for (const f of following) {
      const user = await ctx.db.get(f.userId);
      if (user && user.deletedAt === undefined) out.push(f.userId);
    }
    return out;
  }
  const optedOut = new Set(
    (
      await ctx.db
        .query("radioProgramFollows")
        .withIndex("by_programId_following", (q) =>
          q.eq("programId", program._id).eq("following", false)
        )
        .collect()
    ).map((f) => f.userId)
  );
  const users = await ctx.db.query("users").collect();
  return users
    .filter((u) => u.deletedAt === undefined && !optedOut.has(u._id))
    .map((u) => u._id);
}

/**
 * Send N33 for every program broadcast whose window is open at `now` and
 * which has not sent it yet. The window opens fifteen minutes before
 * `startsAt`, so a soundcheck twenty minutes early sends nothing; a cancelled
 * row never sends; a row with no program (a one off or an unscheduled row)
 * has no followers.
 */
export async function sendDueLivePushes(
  ctx: MutationCtx,
  around: Doc<"radioBroadcasts">[],
  now: number
): Promise<number> {
  let sent = 0;
  for (const b of around) {
    if (!b.programId || b.livePushSentAt !== undefined) continue;
    if (!isInLivePushWindow(b, now)) continue;
    // Re read: `around` was collected earlier in this same transaction, and
    // this is the test half of test and set.
    const fresh = await ctx.db.get(b._id);
    if (!fresh || fresh.livePushSentAt !== undefined || fresh.status === "cancelled") continue;
    const program = await ctx.db.get(b.programId);
    if (!program) continue;

    await ctx.db.patch(b._id, { livePushSentAt: now });
    await ctx.scheduler.runAfter(0, internal.radio.sendLivePush, { broadcastId: b._id });
    sent++;
  }
  return sent;
}

/**
 * Deliver one broadcast's N33, from the job the probe scheduled. Checks the
 * row again, so a broadcast cancelled between the probe and this job sends
 * nothing.
 */
export async function deliverLivePush(
  ctx: MutationCtx,
  broadcastId: Id<"radioBroadcasts">
): Promise<number> {
  const b = await ctx.db.get(broadcastId);
  if (!b || b.status === "cancelled" || !b.programId) return 0;
  const program = await ctx.db.get(b.programId);
  if (!program) return 0;
  const recipients = await radioFollowers(ctx, program);
  if (recipients.length > 0) {
    await sendPushOnly(ctx, recipients, {
      title: `${program.name} is live`,
      body: "It has just started on Reign Radio. Tap to listen.",
      deepLink: { type: "radio_broadcast", id: b._id },
    });
  }
  return recipients.length;
}
