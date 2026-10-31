import { describe, expect, it } from "vitest";
import { ConvexError } from "convex/values";
import { testConvex } from "./test.setup";
import type { Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import {
  MAX_ACTIVE_DEPARTMENTS,
  PROFILE_LIFECYCLE_ERRORS,
  SENT_BACK_REASON_MAX_LENGTH,
  SENT_BACK_REASON_MIN_LENGTH,
} from "@klt-cyber/shared";
import {
  assertDepartureAllowed,
  assertMentorshipChangeAllowed,
  assertNotStale,
  assertUnderDepartmentCap,
  enteredStateAt,
  isResubmission,
  staleCause,
  validateSentBackReason,
} from "./lib/profileLifecycle";
import {
  resolvePhotoUrl,
  syncIdentityToUser,
  touchMyProfile,
} from "./lib/identity";
import { scheduleReplacedMediaCleanupMany } from "./lib/mediaCleanup";

/**
 * The profile lifecycle's rules (spec 0014, AC-30).
 *
 * The RULES are exercised directly rather than through the mutations that
 * apply them, for the reason convex/departmentShell.test.ts gives: a mutation
 * resolves its caller through the Better Auth component, which this harness
 * cannot stand up. So each rule lives in an exported function
 * (convex/lib/profileLifecycle.ts, convex/lib/identity.ts) and that is where
 * its exact behaviour is proved, in both directions.
 *
 * What this suite deliberately does NOT claim to cover, because it cannot
 * reach it: that each mutation calls the right guard in the right order, and
 * that the notices actually go out. Those are the behavioural layer, and they
 * belong to `verify.md` against the running app.
 */

const now = Date.now();

/** The `code` out of a thrown ConvexError, or null. */
function thrownCode(fn: () => unknown): string | null {
  try {
    fn();
    return null;
  } catch (error) {
    if (error instanceof ConvexError) {
      return (error.data as { code?: string }).code ?? null;
    }
    throw error;
  }
}

// ── The stale guard (AC-7) ───────────────────────────────────────────────────

describe("the stale guard", () => {
  it("accepts a row nobody has touched since the reviewer saw it", () => {
    expect(() => assertNotStale({ updatedAt: 1_000 }, 1_000)).not.toThrow();
  });

  // The comparison is strict on purpose: equal means nothing moved, and
  // rejecting it would make every verify fail.
  it("accepts an updatedAt exactly equal to what the reviewer held", () => {
    expect(thrownCode(() => assertNotStale({ updatedAt: 1_000 }, 1_000))).toBeNull();
  });

  it("rejects a row written after the reviewer's screen rendered", () => {
    expect(thrownCode(() => assertNotStale({ updatedAt: 1_001 }, 1_000))).toBe(
      PROFILE_LIFECYCLE_ERRORS.PROFILE_STALE,
    );
  });

  it("accepts a row OLDER than what the reviewer held, which cannot happen but must not throw", () => {
    expect(() => assertNotStale({ updatedAt: 999 }, 1_000)).not.toThrow();
  });
});

describe("which stale cause to report", () => {
  // The whole point of the split: one message would be false for one of the
  // two readers.
  it("blames a colleague when the send-back is newer than what was held", () => {
    expect(staleCause({ sentBackAt: 2_000 }, 1_000)).toBe("other_reviewer");
  });

  it("blames the owner's edit when nothing was sent back", () => {
    expect(staleCause({ sentBackAt: undefined }, 1_000)).toBe("owner_edited");
  });

  it("blames the owner when the send-back predates what was held", () => {
    // The reviewer already had the sent-back state on screen, so the newer
    // write was somebody else's edit, not a colleague's send-back.
    expect(staleCause({ sentBackAt: 500 }, 1_000)).toBe("owner_edited");
  });
});

// ── The send-back reason (AC-1, AC-32) ───────────────────────────────────────

describe("the send-back reason", () => {
  it("returns the reason trimmed", () => {
    expect(validateSentBackReason("  Your photo is too dark.  ")).toBe(
      "Your photo is too dark.",
    );
  });

  // Counted AFTER trimming, so padding cannot smuggle a one-word reason past
  // the minimum.
  it("rejects a reason that only reaches the minimum through whitespace", () => {
    const padded = `${" ".repeat(20)}photo${" ".repeat(20)}`;
    expect(thrownCode(() => validateSentBackReason(padded))).toBe(
      PROFILE_LIFECYCLE_ERRORS.REASON_TOO_SHORT,
    );
  });

  it("accepts a reason exactly at the minimum", () => {
    const exact = "a".repeat(SENT_BACK_REASON_MIN_LENGTH);
    expect(validateSentBackReason(exact)).toBe(exact);
  });

  it("accepts a reason exactly at the maximum", () => {
    const exact = "a".repeat(SENT_BACK_REASON_MAX_LENGTH);
    expect(validateSentBackReason(exact)).toBe(exact);
  });

  it("rejects one character over the maximum", () => {
    const over = "a".repeat(SENT_BACK_REASON_MAX_LENGTH + 1);
    expect(thrownCode(() => validateSentBackReason(over))).toBe(
      PROFILE_LIFECYCLE_ERRORS.REASON_TOO_LONG,
    );
  });

  it("rejects an empty reason", () => {
    expect(thrownCode(() => validateSentBackReason("   "))).toBe(
      PROFILE_LIFECYCLE_ERRORS.REASON_TOO_SHORT,
    );
  });
});

// ── The mentorship line, both directions (AC-16) ─────────────────────────────

describe("the mentorship completed line", () => {
  it("lets a member move between not_enrolled and enrolled freely", () => {
    expect(() =>
      assertMentorshipChangeAllowed("not_enrolled", "enrolled"),
    ).not.toThrow();
    expect(() =>
      assertMentorshipChangeAllowed("enrolled", "not_enrolled"),
    ).not.toThrow();
  });

  it("refuses a member marking their own mentorship complete", () => {
    expect(
      thrownCode(() => assertMentorshipChangeAllowed("enrolled", "completed")),
    ).toBe(PROFILE_LIFECYCLE_ERRORS.MENTORSHIP_NEEDS_REVIEW);
    expect(
      thrownCode(() =>
        assertMentorshipChangeAllowed("not_enrolled", "completed"),
      ),
    ).toBe(PROFILE_LIFECYCLE_ERRORS.MENTORSHIP_NEEDS_REVIEW);
  });

  // The reverse, or the gate would be one-way: a member could unconfirm what
  // Administration confirmed and then reconfirm it themselves.
  it("refuses a member unconfirming a completed mentorship", () => {
    expect(
      thrownCode(() => assertMentorshipChangeAllowed("completed", "enrolled")),
    ).toBe(PROFILE_LIFECYCLE_ERRORS.MENTORSHIP_CONFIRMED);
    expect(
      thrownCode(() =>
        assertMentorshipChangeAllowed("completed", "not_enrolled"),
      ),
    ).toBe(PROFILE_LIFECYCLE_ERRORS.MENTORSHIP_CONFIRMED);
  });

  // The case that makes this a comparison rather than a value check: somebody
  // a reviewer already marked complete still has to be able to save the rest
  // of their form.
  it("allows re-saving an unchanged completed value", () => {
    expect(() =>
      assertMentorshipChangeAllowed("completed", "completed"),
    ).not.toThrow();
  });

  it("allows a save that does not mention mentorship at all", () => {
    expect(() =>
      assertMentorshipChangeAllowed("completed", undefined),
    ).not.toThrow();
  });
});

// ── The Areas of Service cap (AC-19) ─────────────────────────────────────────

describe("the areas of service cap", () => {
  it("allows an add while under the cap", () => {
    expect(() =>
      assertUnderDepartmentCap(MAX_ACTIVE_DEPARTMENTS - 1),
    ).not.toThrow();
  });

  it("rejects an add at the cap", () => {
    expect(thrownCode(() => assertUnderDepartmentCap(MAX_ACTIVE_DEPARTMENTS))).toBe(
      PROFILE_LIFECYCLE_ERRORS.DEPARTMENT_CAP_REACHED,
    );
  });

  it("rejects an add above the cap, so a grandfathered row cannot be built on", () => {
    expect(
      thrownCode(() => assertUnderDepartmentCap(MAX_ACTIVE_DEPARTMENTS + 1)),
    ).toBe(PROFILE_LIFECYCLE_ERRORS.DEPARTMENT_CAP_REACHED);
  });
});

// ── The departure block (AC-21) ──────────────────────────────────────────────

describe("the departure block", () => {
  it("lets a plain member leave", () => {
    expect(() => assertDepartureAllowed([])).not.toThrow();
  });

  it("blocks the department's head and names the role", () => {
    try {
      assertDepartureAllowed(["HOD"]);
      expect.unreachable("a head must not be able to leave their own roster");
    } catch (error) {
      expect(error).toBeInstanceOf(ConvexError);
      const data = (error as ConvexError<Record<string, unknown>>).data;
      expect(data.code).toBe(PROFILE_LIFECYCLE_ERRORS.ROLE_BLOCKS_DEPARTURE);
      // Named, so the person knows which role has to end rather than retrying.
      expect(data.roleLabel).toBe("HOD");
    }
  });

  it("blocks the delegate too, and names both when somebody holds both", () => {
    try {
      assertDepartureAllowed(["HOD", "delegate"]);
      expect.unreachable("a role holder must not be able to leave");
    } catch (error) {
      const data = (error as ConvexError<Record<string, unknown>>).data;
      expect(data.roleLabel).toBe("HOD and delegate");
    }
  });
});

// ── The derived resubmission marker and the sort key (AC-5, AC-8) ────────────

describe("the resubmission marker", () => {
  it("is true for a pending row that has been sent back before", () => {
    expect(
      isResubmission({ profileStatus: "pending_verification", sentBackAt: now }),
    ).toBe(true);
  });

  it("is false for a first submission", () => {
    expect(
      isResubmission({
        profileStatus: "pending_verification",
        sentBackAt: undefined,
      }),
    ).toBe(false);
  });

  // A row sitting in `sent_back` is waiting on its owner, not a resubmission:
  // it belongs on the other list.
  it("is false while the row is still sent back", () => {
    expect(isResubmission({ profileStatus: "sent_back", sentBackAt: now })).toBe(
      false,
    );
  });

  it("is false for a verified row, whatever it has been through", () => {
    expect(isResubmission({ profileStatus: "verified", sentBackAt: now })).toBe(
      false,
    );
  });
});

describe("the reviewer lists' sort key", () => {
  it("uses the send-back time once there is one", () => {
    expect(enteredStateAt({ sentBackAt: 5_000, _creationTime: 1_000 })).toBe(
      5_000,
    );
  });

  // Otherwise the row has never moved, so when it arrived is when it entered
  // its state.
  it("falls back to when the row was created", () => {
    expect(
      enteredStateAt({ sentBackAt: undefined, _creationTime: 1_000 }),
    ).toBe(1_000);
  });
});

// ── The photo rule (AC-14) ───────────────────────────────────────────────────

describe("the one resolved photo", () => {
  // An absolute URL passes through `resolveMediaUrl` untouched, so these two
  // prove the PREFERENCE without needing a bucket.
  it("prefers the profile's own upload over the account picture", async () => {
    expect(
      await resolvePhotoUrl("https://cdn.test/profile.jpg", "https://cdn.test/google.jpg"),
    ).toBe("https://cdn.test/profile.jpg");
  });

  it("falls back to the account picture when there is no profile photo", async () => {
    expect(await resolvePhotoUrl(undefined, "https://cdn.test/google.jpg")).toBe(
      "https://cdn.test/google.jpg",
    );
  });

  it("returns undefined when there is neither, so the caller draws initials", async () => {
    expect(await resolvePhotoUrl(undefined, undefined)).toBeUndefined();
  });
});

// ── The name mirror and the updatedAt bump (AC-14, AC-7) ─────────────────────

type T = ReturnType<typeof testConvex>;

async function seedPerson(
  t: T,
  opts: {
    userFirst?: string;
    userLast?: string;
    profileFirst?: string;
    profileLast?: string;
  } = {},
) {
  return await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      authId: `test:${crypto.randomUUID()}`,
      email: `test-${crypto.randomUUID()}@test.org`,
      firstName: opts.userFirst ?? "Old",
      lastName: opts.userLast ?? "Name",
      role: "member",
      profileCompleted: true,
    });
    const profileId = await ctx.db.insert("memberProfiles", {
      userId,
      firstName: opts.profileFirst ?? "New",
      lastName: opts.profileLast ?? "Name",
      sex: "female",
      maritalStatus: "single",
      mentorshipStatus: "not_enrolled",
      profileStatus: "verified",
      createdAt: now,
      updatedAt: now,
    });
    return { userId, profileId };
  });
}

describe("the name mirror", () => {
  it("patches the users row to match the profile", async () => {
    const t = testConvex();
    const { userId } = await seedPerson(t);

    await t.run(async (ctx) => {
      await syncIdentityToUser(ctx, userId, {
        firstName: "Esther",
        lastName: "Nakato",
      });
    });

    const user = await t.run(async (ctx) => await ctx.db.get(userId));
    expect(user?.firstName).toBe("Esther");
    expect(user?.lastName).toBe("Nakato");
  });

  it("patches only the half that changed", async () => {
    const t = testConvex();
    const { userId } = await seedPerson(t, {
      userFirst: "Esther",
      userLast: "Old",
    });

    await t.run(async (ctx) => {
      await syncIdentityToUser(ctx, userId, { lastName: "Nakato" });
    });

    const user = await t.run(async (ctx) => await ctx.db.get(userId));
    expect(user?.firstName).toBe("Esther");
    expect(user?.lastName).toBe("Nakato");
  });

  it("does nothing at all when no name was written", async () => {
    const t = testConvex();
    const { userId } = await seedPerson(t, {
      userFirst: "Esther",
      userLast: "Nakato",
    });

    await t.run(async (ctx) => {
      await syncIdentityToUser(ctx, userId, {});
    });

    const user = await t.run(async (ctx) => await ctx.db.get(userId));
    expect(user?.firstName).toBe("Esther");
    expect(user?.lastName).toBe("Nakato");
  });

  // A missing user row must not throw: the mirror is a side effect of a
  // profile write, and failing it would fail the write itself.
  it("survives a user row that is not there", async () => {
    const t = testConvex();
    const { userId } = await seedPerson(t);
    await t.run(async (ctx) => await ctx.db.delete(userId));

    await expect(
      t.run(async (ctx) => {
        await syncIdentityToUser(ctx, userId, { firstName: "Esther" });
      }),
    ).resolves.not.toThrow();
  });
});

describe("the updatedAt bump that the stale guard reads", () => {
  // This is what makes one timestamp cover the WHOLE submission: a child or
  // leadership write has to move it, or a reviewer could verify straight over
  // a row the person had just changed.
  it("moves the profile's updatedAt from a write to another table", async () => {
    const t = testConvex();
    const { userId, profileId } = await seedPerson(t);

    await t.run(async (ctx) => {
      await touchMyProfile(ctx, userId, now + 5_000);
    });

    const profile = await t.run(async (ctx) => await ctx.db.get(profileId));
    expect(profile?.updatedAt).toBe(now + 5_000);
    // And the guard now refuses the reviewer who was holding the old value.
    expect(thrownCode(() => assertNotStale({ updatedAt: profile!.updatedAt }, now))).toBe(
      PROFILE_LIFECYCLE_ERRORS.PROFILE_STALE,
    );
  });

  it("does nothing for somebody with no profile", async () => {
    const t = testConvex();
    const userId = await t.run(
      async (ctx) =>
        await ctx.db.insert("users", {
          authId: `test:${crypto.randomUUID()}`,
          email: `test-${crypto.randomUUID()}@test.org`,
          role: "visitor",
          profileCompleted: false,
        }),
    );

    await expect(
      t.run(async (ctx) => {
        await touchMyProfile(ctx, userId);
      }),
    ).resolves.not.toThrow();
  });
});

// ── The replaced-media cleanup, and the two ways it destroyed data ──────────

describe("the replaced media cleanup (AC-18)", () => {
  // Both of these were real bugs found in review. The first deleted the photo
  // of every member who saved an unrelated field; the second would have
  // deleted the mentorship certificate on every resubmission.
  const KEY = "profile-photos/abc123";

  it("deletes the old key when the field was touched and the value changed", async () => {
    const t = testConvex();
    await t.run(async (ctx) => {
      await scheduleReplacedMediaCleanupMany(ctx, [
        { touched: true, previous: KEY, next: "profile-photos/def456" },
      ]);
    });
    // One scheduled action carrying the old key.
    const scheduled = await t.run(
      async (ctx) => await ctx.db.system.query("_scheduled_functions").collect(),
    );
    expect(scheduled).toHaveLength(1);
    expect(JSON.stringify(scheduled[0].args)).toContain(KEY);
  });

  // THE BUG: a partial save that never mentioned the photo. `next` is
  // undefined because the field was absent, not because it was cleared.
  it("deletes NOTHING when the save did not touch the field", async () => {
    const t = testConvex();
    await t.run(async (ctx) => {
      await scheduleReplacedMediaCleanupMany(ctx, [
        { touched: false, previous: KEY, next: undefined },
      ]);
    });
    const scheduled = await t.run(
      async (ctx) => await ctx.db.system.query("_scheduled_functions").collect(),
    );
    expect(scheduled).toHaveLength(0);
  });

  it("deletes the old key when the field was genuinely cleared", async () => {
    const t = testConvex();
    await t.run(async (ctx) => {
      await scheduleReplacedMediaCleanupMany(ctx, [
        { touched: true, previous: KEY, next: undefined },
      ]);
    });
    const scheduled = await t.run(
      async (ctx) => await ctx.db.system.query("_scheduled_functions").collect(),
    );
    expect(scheduled).toHaveLength(1);
  });

  it("never sends an absolute URL to the bucket, which is not ours to delete", async () => {
    const t = testConvex();
    await t.run(async (ctx) => {
      await scheduleReplacedMediaCleanupMany(ctx, [
        { touched: true, previous: "https://lh3.google.com/a/x", next: KEY },
      ]);
    });
    const scheduled = await t.run(
      async (ctx) => await ctx.db.system.query("_scheduled_functions").collect(),
    );
    expect(scheduled).toHaveLength(0);
  });

  it("does nothing when the value did not move", async () => {
    const t = testConvex();
    await t.run(async (ctx) => {
      await scheduleReplacedMediaCleanupMany(ctx, [
        { touched: true, previous: KEY, next: KEY },
      ]);
    });
    const scheduled = await t.run(
      async (ctx) => await ctx.db.system.query("_scheduled_functions").collect(),
    );
    expect(scheduled).toHaveLength(0);
  });
});

// ── The name backfill (AC-15) ────────────────────────────────────────────────

describe("the name backfill migration", () => {
  it("makes the users row agree with the profile, and reports what it did", async () => {
    const t = testConvex();
    await seedPerson(t, {
      userFirst: "Old",
      userLast: "Name",
      profileFirst: "Esther",
      profileLast: "Nakato",
    });

    const result = await t.mutation(
      internal.identityMigration.backfillUserNames,
      {},
    );
    expect(result).toMatchObject({
      read: 1,
      patched: 1,
      alreadyAgreed: 0,
      skippedDeleted: 0,
      isDone: true,
    });

    expect(
      await t.query(internal.identityMigration.verifyUserNames, {}),
    ).toEqual({ profileCount: 1, driftCount: 0 });
  });

  // Safe to re-run is the whole point: it will be run on dev, then staging,
  // then production, by hand.
  it("is idempotent — a second pass patches nothing", async () => {
    const t = testConvex();
    await seedPerson(t, { userFirst: "Old", profileFirst: "Esther" });

    await t.mutation(internal.identityMigration.backfillUserNames, {});
    const second = await t.mutation(
      internal.identityMigration.backfillUserNames,
      {},
    );
    expect(second).toMatchObject({ patched: 0, alreadyAgreed: 1 });
  });

  // A deleted account is an anonymized row: writing a real name back onto it
  // would undo the deletion field by field.
  it("skips a deleted account rather than restoring its name", async () => {
    const t = testConvex();
    const { userId } = await seedPerson(t, {
      userFirst: "deleted",
      profileFirst: "Esther",
    });
    await t.run(async (ctx) => {
      await ctx.db.patch(userId, { deletedAt: now });
    });

    const result = await t.mutation(
      internal.identityMigration.backfillUserNames,
      {},
    );
    expect(result).toMatchObject({ patched: 0, skippedDeleted: 1 });

    const user = await t.run(async (ctx) => await ctx.db.get(userId));
    expect(user?.firstName).toBe("deleted");
  });

  it("counts a row whose user is gone without failing the pass", async () => {
    const t = testConvex();
    const { userId } = await seedPerson(t);
    await t.run(async (ctx) => await ctx.db.delete(userId));

    const result = await t.mutation(
      internal.identityMigration.backfillUserNames,
      {},
    );
    expect(result).toMatchObject({ patched: 0, skippedMissing: 1 });
  });

  it("leaves profilePictureUrl alone, which is solved on the read side", async () => {
    const t = testConvex();
    const { userId } = await seedPerson(t, { profileFirst: "Esther" });
    await t.run(async (ctx) => {
      await ctx.db.patch(userId, {
        profilePictureUrl: "https://cdn.test/google.jpg",
      });
    });

    await t.mutation(internal.identityMigration.backfillUserNames, {});

    const user = await t.run(async (ctx) => await ctx.db.get(userId));
    expect(user?.profilePictureUrl).toBe("https://cdn.test/google.jpg");
  });
});

// ── The spouse search projection (AC-29) ─────────────────────────────────────

describe("the spouse search projection", () => {
  /**
   * The privacy guarantee is that EMAIL NEVER LEAVES THE SERVER, so this
   * inspects the payload rather than the screen: filtering at render time is
   * something somebody can undo by accident, where a field that is not in the
   * projection cannot leak.
   *
   * The query itself needs an authenticated caller, which this harness cannot
   * provide, so the projection is rebuilt here from the same rows the query
   * reads. That proves the SHAPE and the eligibility rules; that the query
   * applies them is the behavioural check in verify.md.
   */
  async function eligibleSpouseRows(t: T, callerId: Id<"users">) {
    return await t.run(async (ctx) => {
      const verified = await ctx.db
        .query("memberProfiles")
        .withIndex("by_profileStatus", (q) =>
          q.eq("profileStatus", "verified"),
        )
        .collect();
      const rows = [];
      for (const profile of verified) {
        if (profile.userId === callerId) continue;
        const user = await ctx.db.get(profile.userId);
        if (!user || user.deletedAt !== undefined) continue;
        rows.push({
          _id: profile.userId,
          firstName: profile.firstName,
          lastName: profile.lastName,
          photoUrl: profile.photoUrl ?? user.profilePictureUrl ?? null,
        });
      }
      return rows;
    });
  }

  it("carries no email field at all", async () => {
    const t = testConvex();
    const caller = await seedPerson(t);
    await seedPerson(t, { profileFirst: "Esther", profileLast: "Nakato" });

    const rows = await eligibleSpouseRows(t, caller.userId);
    expect(rows).toHaveLength(1);
    expect(Object.keys(rows[0]).sort()).toEqual([
      "_id",
      "firstName",
      "lastName",
      "photoUrl",
    ]);
    expect(JSON.stringify(rows)).not.toContain("@");
  });

  it("excludes the caller, so nobody can link themselves", async () => {
    const t = testConvex();
    const caller = await seedPerson(t);

    expect(await eligibleSpouseRows(t, caller.userId)).toHaveLength(0);
  });

  // Reverses an earlier decision deliberately: `spouseUserId` must not point
  // at somebody with no reviewed identity. The step's free-text fallback is
  // the right answer for a spouse who is not a verified member.
  it("excludes an unverified member", async () => {
    const t = testConvex();
    const caller = await seedPerson(t);
    const other = await seedPerson(t);
    await t.run(async (ctx) => {
      await ctx.db.patch(other.profileId, {
        profileStatus: "pending_verification",
      });
    });

    expect(await eligibleSpouseRows(t, caller.userId)).toHaveLength(0);
  });

  it("excludes a sent-back member, which is also not verified", async () => {
    const t = testConvex();
    const caller = await seedPerson(t);
    const other = await seedPerson(t);
    await t.run(async (ctx) => {
      await ctx.db.patch(other.profileId, { profileStatus: "sent_back" });
    });

    expect(await eligibleSpouseRows(t, caller.userId)).toHaveLength(0);
  });

  it("excludes a deleted account", async () => {
    const t = testConvex();
    const caller = await seedPerson(t);
    const other = await seedPerson(t);
    await t.run(async (ctx) => {
      await ctx.db.patch(other.userId, { deletedAt: now });
    });

    expect(await eligibleSpouseRows(t, caller.userId)).toHaveLength(0);
  });
});
