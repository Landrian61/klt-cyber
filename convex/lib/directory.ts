import { ConvexError } from "convex/values";
import type { QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import {
  DIRECTORY_ERROR_CODES,
  normalizeMemberPhone,
  whatsAppDigits,
} from "@klt-cyber/shared";
import { getCurrentUser } from "./authz";
import { resolvePhotoUrl } from "./identity";

// The member directory's privacy gate (spec 0022, SRS M5-03, NF-02).
//
// Every directory row and card is built here and nowhere else (key invariant):
// `toDirectoryRow` and `toDirectoryCard` take the viewer's sharing flag and
// decide what leaves the server. Shared fields are copied in BY NAME from the
// profile, never by spreading it, so a field added to `memberProfiles` later
// stays private until somebody deliberately adds it here.
//
// The rule (AC-7): contact and work details travel only when the viewer AND
// the target both have `directorySharing === true`. An absent value is
// private on both sides, which is spec 0014's rule for the field.
//
// Never read here, for anyone: home address, year of birth, marital status,
// spouse, children, next of kin, mentorship, leadership progress and role
// assignments. The mobile directory does not read `roleAssignments` at all.

export interface DirectoryViewer {
  user: Doc<"users">;
  profile: Doc<"memberProfiles">;
  sharing: boolean;
}

export interface DirectoryRow {
  userId: Id<"users">;
  name: { first: string; middle?: string; last: string };
  photoUrl?: string;
  clan?: { id: Id<"clans">; name: string };
  departmentIds: Id<"departments">[];
  /** Only when both sides share, or on the viewer's own row (AC-7, AC-3). */
  occupation?: string;
  /** Only when both sides share; never present for a private viewer (AC-8). */
  contactable?: true;
}

export interface DirectoryShared {
  phone?: { raw: string; dial: string; whatsappDigits?: string };
  email: string;
  occupation?: string;
  industry?: string;
  employer?: string;
  skills?: string[];
  shortBio?: string;
  birthday?: { day: number; month: number };
}

export interface DirectoryCard {
  isSelf: boolean;
  viewerSharing: boolean;
  /** Only when the viewer shares, or on the viewer's own card. */
  targetSharing?: boolean;
  basic: DirectoryRow;
  /** Only when both sides share, or on the viewer's own card. */
  shared?: DirectoryShared;
}

export type ClanLookup = Map<Id<"clans">, { id: Id<"clans">; name: string }>;

/** `directorySharing` absent or false both mean private. */
export function isSharing(profile: Pick<Doc<"memberProfiles">, "directorySharing">): boolean {
  return profile.directorySharing === true;
}

function membersOnly(): ConvexError<{ code: string }> {
  return new ConvexError({ code: DIRECTORY_ERROR_CODES.MEMBERS_ONLY });
}

/**
 * The caller, if they may read the directory at all (AC-2): signed in, not
 * deleted (`getCurrentUser` already resolves a deleted row to null), a
 * `member`, and holding a `verified` profile of their own. Anything else is
 * one `DIRECTORY_MEMBERS_ONLY` error, so the reasons cannot be told apart.
 */
export async function requireDirectoryViewer(ctx: QueryCtx): Promise<DirectoryViewer> {
  const user = await getCurrentUser(ctx);
  if (!user || user.role !== "member") throw membersOnly();
  const profile = await ctx.db
    .query("memberProfiles")
    .withIndex("by_userId", (q) => q.eq("userId", user._id))
    .unique();
  if (!profile || profile.profileStatus !== "verified") throw membersOnly();
  return { user, profile, sharing: isSharing(profile) };
}

/** All clans, read once per query, keyed by id. */
export async function loadClanLookup(ctx: QueryCtx): Promise<ClanLookup> {
  const clans = await ctx.db.query("clans").withIndex("by_order").collect();
  return new Map(clans.map((clan) => [clan._id, { id: clan._id, name: clan.name }]));
}

/**
 * A target counts as in the directory only when its user row exists, is not
 * deleted, is a `member`, and its profile is `verified` (AC-1, AC-14).
 */
export function isListable(
  user: Doc<"users"> | null,
  profile: Doc<"memberProfiles"> | null
): user is Doc<"users"> {
  return (
    user !== null &&
    user.deletedAt === undefined &&
    user.role === "member" &&
    profile !== null &&
    profile.profileStatus === "verified"
  );
}

/**
 * One directory row. `showShared` is decided here from the two flags, never
 * passed in, so no caller can widen it (key invariant).
 */
export async function toDirectoryRow(
  viewer: DirectoryViewer,
  target: { user: Doc<"users">; profile: Doc<"memberProfiles"> },
  clans: ClanLookup,
  departmentIds: Id<"departments">[]
): Promise<DirectoryRow> {
  const { user, profile } = target;
  const isSelf = user._id === viewer.user._id;
  const bothShare = viewer.sharing && isSharing(profile);

  const row: DirectoryRow = {
    userId: user._id,
    name: {
      first: profile.firstName,
      ...(profile.middleName ? { middle: profile.middleName } : {}),
      last: profile.lastName,
    },
    departmentIds,
  };
  const photoUrl = await resolvePhotoUrl(profile.photoUrl, user.profilePictureUrl);
  if (photoUrl) row.photoUrl = photoUrl;
  const clan = profile.clanId ? clans.get(profile.clanId) : undefined;
  if (clan) row.clan = clan;
  if ((isSelf || bothShare) && profile.occupation) row.occupation = profile.occupation;
  if (bothShare) row.contactable = true;
  return row;
}

/** The allowlisted shared fields of one profile, copied in by name (AC-7). */
function sharedFields(user: Doc<"users">, profile: Doc<"memberProfiles">): DirectoryShared {
  const shared: DirectoryShared = { email: user.email };
  if (profile.phone) {
    const normalized = normalizeMemberPhone(profile.phone);
    shared.phone = {
      raw: profile.phone,
      dial: normalized ?? profile.phone,
      ...(normalized ? { whatsappDigits: whatsAppDigits(normalized) } : {}),
    };
  }
  if (profile.occupation) shared.occupation = profile.occupation;
  if (profile.industry) shared.industry = profile.industry;
  if (profile.employer) shared.employer = profile.employer;
  if (profile.skills && profile.skills.length > 0) shared.skills = [...profile.skills];
  if (profile.shortBio) shared.shortBio = profile.shortBio;
  // Day and month only: the year is never read into a directory response.
  if (profile.dateOfBirth) {
    shared.birthday = { day: profile.dateOfBirth.day, month: profile.dateOfBirth.month };
  }
  return shared;
}

/** One card (AC-9, AC-11, AC-13). Self always sees its own shared fields. */
export async function toDirectoryCard(
  viewer: DirectoryViewer,
  target: { user: Doc<"users">; profile: Doc<"memberProfiles"> },
  clans: ClanLookup,
  departmentIds: Id<"departments">[]
): Promise<DirectoryCard> {
  const isSelf = target.user._id === viewer.user._id;
  const targetSharing = isSharing(target.profile);
  const showShared = isSelf || (viewer.sharing && targetSharing);

  const card: DirectoryCard = {
    isSelf,
    viewerSharing: viewer.sharing,
    basic: await toDirectoryRow(viewer, target, clans, departmentIds),
  };
  if (isSelf || viewer.sharing) card.targetSharing = targetSharing;
  if (showShared) card.shared = sharedFields(target.user, target.profile);
  return card;
}

/** Sort key per AC-1: first name, then last name, case and accent blind, ties by id. */
export function compareDirectoryRows(a: DirectoryRow, b: DirectoryRow): number {
  const options = { sensitivity: "base" } as const;
  return (
    (a.name.first ?? "").localeCompare(b.name.first ?? "", undefined, options) ||
    (a.name.last ?? "").localeCompare(b.name.last ?? "", undefined, options) ||
    (a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0)
  );
}
