import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { resolveMediaUrl } from "./media";

// One source of truth for a person's NAME and PHOTO across both apps
// (SRS F1-07, spec 0014 AC-14).
//
// The two halves are solved by two different mechanisms, which is forced
// rather than chosen, and is the thing to know before touching either:
//
//   NAME is mirrored ON WRITE. `users.firstName`/`lastName` are read by the
//   auth surfaces and by every list that joins a user row, while
//   `memberProfiles` holds the reviewed version. Both are plain strings, so
//   the profile's copy is pushed onto the user row inside whichever mutation
//   writes it. `syncIdentityToUser` below is that write; every profile-name
//   writer calls it.
//
//   PHOTO is resolved ON READ. It cannot be mirrored: `resolveMediaUrl`
//   returns a SIGNED R2 URL that expires, so a copy stored on the user row
//   would be a link that works for a week and then 403s. Instead every server
//   read that feeds an avatar returns one already-resolved `photoUrl`
//   (`resolvePhotoUrl` below), preferring the profile's upload and falling
//   back to `users.profilePictureUrl` — which holds a Google account URL, or
//   nothing, and must never hold an R2 key.
//
// So the invariant is two rules, not one:
//   - after any profile-name write, `users` and `memberProfiles` agree;
//   - `users.profilePictureUrl` never holds an R2 key, and no client renders
//     it without first preferring a resolved profile photo.

/**
 * Mirror a profile's name onto its `users` row, in the same mutation.
 *
 * Called by every writer of profile `firstName`/`lastName`: `submitProfile`,
 * `resubmitProfile`, `verifyProfile`'s `edits` patch and
 * `profile.updateMyProfile`. Structural on purpose — a rule somebody has to
 * remember is how the two drifted apart in the first place.
 *
 * Patches only what changed, and nothing at all when neither name moved, so
 * an unrelated save does not touch the user row.
 */
export async function syncIdentityToUser(
  ctx: MutationCtx,
  userId: Id<"users">,
  names: { firstName?: string; lastName?: string }
): Promise<void> {
  if (names.firstName === undefined && names.lastName === undefined) return;

  const user = await ctx.db.get(userId);
  if (!user) return;

  const patch: { firstName?: string; lastName?: string } = {};
  if (names.firstName !== undefined && names.firstName !== user.firstName) {
    patch.firstName = names.firstName;
  }
  if (names.lastName !== undefined && names.lastName !== user.lastName) {
    patch.lastName = names.lastName;
  }
  if (Object.keys(patch).length === 0) return;

  await ctx.db.patch(userId, patch);
}

/**
 * Bump `memberProfiles.updatedAt` for a member-owned write (spec 0014, AC-7).
 *
 * Every member-owned mutation calls this, INCLUDING the ones that write a
 * different table: children, leadership, clan, sharing, claims. Otherwise the
 * reviewer's stale guard would cover only the profile row's own fields, and a
 * reviewer could verify straight over a child or leadership row the person had
 * just changed, with no error and nothing on any screen saying it happened.
 *
 * One timestamp, the whole submission.
 */
export async function touchMyProfile(
  ctx: MutationCtx,
  userId: Id<"users">,
  now: number = Date.now()
): Promise<void> {
  const profile = await ctx.db
    .query("memberProfiles")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .unique();
  if (!profile) return;
  await ctx.db.patch(profile._id, { updatedAt: now });
}

/**
 * The one photo URL a client should render for a person, already resolved.
 *
 * Prefers the profile's uploaded photo (the reviewed one) and falls back to
 * whatever the account arrived with. Returns `undefined` when there is
 * neither, so the caller draws its initials placeholder.
 *
 * Every read that feeds an avatar goes through this. No client reads the raw
 * `users.profilePictureUrl` any more: a missed one shows a stale avatar rather
 * than failing, which is the quiet kind of defect this helper exists to stop.
 */
export async function resolvePhotoUrl(
  profilePhotoUrl: string | undefined,
  userPictureUrl: string | undefined
): Promise<string | undefined> {
  if (profilePhotoUrl) return await resolveMediaUrl(profilePhotoUrl);
  return userPictureUrl ?? undefined;
}

/**
 * The resolved photo for a user id, looking both rows up.
 *
 * For reads that hold neither document yet. Where a caller already has the
 * profile and the user row, `resolvePhotoUrl` above avoids the two gets.
 */
export async function resolvePhotoUrlForUser(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
  profile?: Doc<"memberProfiles"> | null
): Promise<string | undefined> {
  const [user, resolvedProfile] = await Promise.all([
    ctx.db.get(userId),
    profile !== undefined
      ? Promise.resolve(profile)
      : ctx.db
          .query("memberProfiles")
          .withIndex("by_userId", (q) => q.eq("userId", userId))
          .unique(),
  ]);
  return await resolvePhotoUrl(
    resolvedProfile?.photoUrl,
    user?.profilePictureUrl
  );
}
