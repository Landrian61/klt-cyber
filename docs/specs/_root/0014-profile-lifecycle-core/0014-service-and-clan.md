# 0014c. Areas of Service and clan, self service

Child of [0014 Profile lifecycle core](index.md). Covers F2-07, F2-08, F2-16, F2-10 and acceptance criteria **AC-19** to **AC-25**.

## Summary

A person picks their Areas of Service and their clan once, during the wizard, and after that only a leader can change either. This child hands both back to the member: join a department (as a request its HOD confirms), withdraw that request, leave a roster unless you lead it, and set or change your clan with both elders told. It also gives a verified member with no clan an honest sentence instead of "Not set", and proves the three F2-10 rules that spec 0012 appears to have already satisfied rather than assuming them.

Almost nothing here is new machinery. Spec 0012 built the claim lifecycle, the live row helpers and the one live row per pair invariant; this child adds the member facing entry points to them.

## Design

### Adding an Area of Service

```
departmentMemberships.addMyAreaOfService({ departmentId })
```

`requireUser`, then the caller's own profile must be `verified`. Pre verification claims already happen inside `submitProfile`, and a pending visitor edits those through the wizard, so this path is for verified members only (**AC-19**).

1. Reject when the profile is not verified.
2. `findLiveMemberships(ctx, user._id)`. Reject when the count is already `MAX_ACTIVE_DEPARTMENTS`.
3. `findLiveMembership(ctx, user._id, departmentId)`. Reject when one exists, naming the department and distinguishing "you already serve in X" from "you have already asked to serve in X", exactly as `submitProfile` does today.
4. Insert one `pending_claim` row with `claimedAt: now` and `addedBy: user._id`.
5. Write `activityLogs` `department.claim_created`, carrying `departmentId` at the top level so it reaches that department's own dashboard feed, and `metadata: { userId, departmentId, selfService: true }`, matching what `submitProfile` already writes.
6. Notify that department's HOD, because unlike a claim made during submission this claimant is already verified, so the request is actionable immediately. Spec 0013's reason for holding the alert back (an unverified claimant gives the HOD nothing to act on) does not apply here.

**The cap counts live rows, `active` and `pending_claim` together.** Confirmations are independent of one another, so counting only active seats would let a member queue ten requests and land on ten rosters once the HODs each said yes, with no single mutation ever seeing a violation. `findLiveMemberships` exists because spec 0012 hit this same ambiguity (**AC-19**).

### Withdrawing a request

```
departmentMemberships.withdrawMyClaim({ departmentId })
```

Always allowed. The row moves to a terminal status, that department's HOD is notified so a request they were about to confirm does not simply vanish, and `department.claim_withdrawn` is logged (**AC-20**).

Use `declined` as the terminal status with `decidedBy` set to the member themself, rather than adding a fourth status value. Spec 0012 already treats `declined` as terminal, and the `decidedBy` field distinguishes a withdrawal from an HOD's decline for anyone reading the row. Flagged in the umbrella's Follow-up: if the distinction ever needs to be visible in the interface, that is the moment to add a status value rather than now.

### Leaving a roster

```
departmentMemberships.leaveMyAreaOfService({ departmentId })
```

1. The caller must hold an `active` row for that department.
2. Read `roleAssignments` on `by_userId_status`, filtered to `status: "active"`, that `departmentId`, and `roleType` of `hod` or `department_admin`. If any row matches, reject with `ROLE_BLOCKS_DEPARTURE` and a message that **names the role** and says it has to be ended first, so the member knows who to ask instead of retrying (**AC-21**).
3. Otherwise call the shared helper below.
4. Notify that department's HOD and delegate. The member who acted gets nothing, because they already know.

**The existing mutation cannot be called, so a helper is factored out.** `departmentMemberships.removeDepartmentMember` is gated by `requireDepartmentCapability(ctx, departmentId, "removeMember")`, which a plain member does not satisfy, and it always sends N12 to the person removed, which is wrong when that person is the caller. The first draft of this spec said "reuse the existing removal path", which cannot work.

So extract from it:

```
endDepartmentMembership(ctx, { membership, actorUserId, notifyMember })
```

holding the patch to `removed`, the role revocation, the audit entry and the optional N12. `removeDepartmentMember` keeps its capability gate and calls the helper with `notifyMember: true`; `leaveMyAreaOfService` calls it with `notifyMember: false`. The authorization stays in each mutation, where it belongs, and there is still exactly one removal path.

There is no confirmation step in the mutation. The portal and the app ask before calling it, since rejoining means a fresh claim and another wait.

### Changing clan

```
profile.changeMyClan({ clanId })   // clanId omitted clears it
```

`requireUser`, profile must be `verified`. Free to change at any time, which is F2-08 read plainly.

**This is the only writer of `clanId`.** `clanId` is deliberately absent from `profile.updateMyProfile`'s arguments, because leaving it there would have let a verified member change their clan with no elder notices and no audit entry, through a mutation that knows nothing about either.

1. Read the **outgoing** elder before the patch, from `roleAssignments` on `by_clanId` with `roleType: "clan_elder"` and `status: "active"` against the current `clanId`. After the patch that lookup is gone.
2. Patch `clanId` (or clear it) and `updatedAt`.
3. Write `activityLogs` `profile.clan_changed` with both the old and the new clan in metadata.
4. Notify the incoming clan's elder on N26, which the SRS catalogue already names "Member joined or moved into clan".
5. Notify the outgoing clan's elder that they have lost a member.

A clan with no sitting elder notifies nobody and does not fail the change (**AC-22**). Clearing the clan has an outgoing elder but no incoming one, and the same rule applies. Setting the clan the member already has is a no op: no patch, no log, no notice, so a form resave cannot spam two elders.

**The churn this allows is deliberate and is not prevented.** A member may move between clans as often as they like, and H5's Hospitality assignment can be overridden by the member the moment it lands. Telling both elders is the mitigation. H5's job stays about members who never chose a clan at all, which `clanId` being absent still identifies.

### "I don't know my clan"

The wizard's clan step offers "None" today, mapped to a local `__none__` sentinel that becomes `clanId: undefined`. The label becomes "I don't know my clan" and nothing else changes (**AC-23**).

No field records the difference between declining to answer and not knowing, because nothing acts on that difference: H5-02 finds people to place by looking for a verified profile with no `clanId`, which both cases produce. Adding a field to record a distinction nothing reads would be state with no reader.

### The unassigned clan sentence

A verified member with no clan reads "Your clan will be assigned by the Hospitality team" wherever their clan would show, from the shared constant, on the mobile profile screen and in the portal (**AC-24**). The condition is `profileStatus === "verified" && clanId === undefined`. A pending visitor keeps the neutral "Not set", because nothing has been promised to them yet.

### F2-10, verify before building

F2-10 asks that people who claimed a department before verification are visible to that HOD, marked pending, excluded from counts and analytics, and not appointable until verified. The code already looks right in all three respects:

| Rule | Where it appears to hold |
|---|---|
| visible, marked pending | spec 0012's roster read returns `pending` as its own list, sorted oldest claim first |
| excluded from counts and analytics | `convex/admin.ts` separates pending from verified; `convex/analytics.ts` reads `by_profileStatus` rather than counting everyone |
| not appointable until verified | `convex/departmentMemberships.ts` gates on `profileStatus === "verified"` in three places, and `convex/lib/authz.ts` has the same check |

So this is verify work, not build work. `verify.md` walks each of the three rules against the live app, and only a rule that actually fails becomes a task (**AC-25**). This is deliberately not an audit of every count in the repository: the rules either hold in the live app or they do not, and walking them is cheaper and more honest than reading every query that counts a member.

**The pass criterion**, so this is not a judgement call at verify time: an unverified claimant appears in the roster's own pending section; the member total on that page, the department dashboard cards and the Administration dashboard each exclude them; and both the HOD and the delegate appointment calls reject them server side, not merely hide the button. All three, or the failing one becomes a task in slice 5.

One thing AC-31 does change here: the Administration counts are being extended to cover `sent_back` as well as `pending_verification`, so "excluded from counts" means excluded from the **verified** counts, while both unverified states are counted together as not yet verified.

### Surfaces

**Mobile.** The Areas of Service section of the profile screen gains add, withdraw and leave. Pending claims show as pending and are withdrawable; active seats are leavable unless the role block applies, in which case the button explains rather than hides. The clan row becomes a picker. Follow the `klt-cyber-brand` skill, including haptics on each action.

**Portal.** The same four actions on the Settings page, following `klt-cyber-web-ui`. The existing `dialog`, `select` and `switch` primitives cover it; nothing new is added.

### Tests

- the cap rejects a fourth live row, counting a mix of `active` and `pending_claim`
- a second live row for the same person and department is rejected, with the department named
- an unverified profile is rejected by both `addMyAreaOfService` and `changeMyClan`
- withdrawing a claim writes the terminal row, the log entry and the HOD notice
- leaving a roster is rejected for the department's HOD and for its delegate, with the role named, and the row is unchanged afterwards
- leaving a roster as a plain member removes the seat through the existing path
- a clan change notifies both elders; a change out of a clan with no elder notifies only the incoming one; a change into a clan with no elder still succeeds
- clearing a clan succeeds and notifies only the outgoing elder
