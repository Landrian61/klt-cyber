# 0021. Administration core: rationale

## Context

The Administration portal (`apps/admin/app/(admin)/areas-of-service/admin/`, Convex modules `admin`, `events`, `roles`, `plannedActivities`, `memberProfiles`) is mostly built. Several of its SRS §4.8 stories already shipped through other features: send back and resubmission (feature 9, spec 0014), first publish only and the announcement category (specs 0013 and 0010), single occurrence cancel and restore (spec 0009), and start and end times on events. What remains is a set of gaps and one bug.

The bug is a launch blocker (SRS §12, as built issue I-1). The dashboard's recent activity card calls `admin.listRecentActivity`, which goes through `getSystemAdminOrNull`. That helper throws for any signed in caller who is not a System Admin, so the Administration HOD and delegates get a query error on their own home page.

The gaps are these. Events have no audience, so every event pushes and reminds the whole church (N16 to N18 to `all`), though A5-02 says only the audience is notified, reminded and sees it. Events cannot be cancelled. The directory leaves out contact details, which SRS §3.5 grants Administration. Departments has a page but no sidebar entry and no leader information. Clans have no page at all, and only the System Admin can appoint an elder, though F3-16 names the Administration HOD too. The year planner cannot delete, and it does not show department or clan activities.

The forces: launch is 29 November 2026, and Track A owns the schema and all deployments. Staging auto deploys on every push to `main`, so a schema change must be safe to roll out in steps. The project already has frozen audience patterns (spec 0013), dispatch time reminder resolution (spec 0012 activities), a live group membership resolver (spec 0010), and revoke and replace role cardinality, all of which a design here should reuse rather than duplicate. The data touched includes personal contact details, so the authority checks must be server side.

## Options considered

### Option 1: Fix in place, one audience union on events (chosen)

Close each gap in the module that owns it. Add one discriminated union `audience` field to `events`, backfilled to `church`. Fan notifications out as a frozen `users` list resolved at each send, and resolve reminders when they fire. Reuse `getEligibleGroups` for visibility and the existing role helpers for appointments.

**Pros**:
- One additive field. Every other change is a function or a page.
- Reuses three proven patterns already in the codebase, so reviewers and `/develop` recognise them.
- Invalid audience states cannot be represented.

**Cons**:
- Frozen `users` notifications don't follow roster changes after sending (a late joiner misses the old N16 in the app).
- Audience filtering in memory on every member read.

### Option 2: New notification audience variants

Same events field, but add `serving` and `departments` variants to `notificationAudienceValidator` and `resolveAudience`, so the in app notification centre tracks live roster membership.

**Pros**:
- The notification centre stays in sync with roster changes.
- No large user id arrays stored on notification rows.

**Cons**:
- Widens a contract shared by every notifying feature, with an exhaustive switch and read side matching in `notifications.ts` to extend.
- Two audience rules (push verified only, read wider) now live inside the notification layer as well as the content layer.

### Option 3: Flat audience fields

`audienceType` plus optional `audienceDepartmentIds` on `events`.

**Pros**:
- Simple to filter, and could be indexed.

**Cons**:
- Allows mismatched states (`serving` with ids, `departments` with none), which every writer must police.
- Breaks with the discriminated union style the notification audience already uses.

### Option 4: Leave the audience optional, treat missing as church

No migration, with a reader default.

**Pros**:
- One deploy, no backfill.

**Cons**:
- Every present and future reader must remember the default forever. One that forgets shows a church event to nobody.

## Rationale

The engineer chose the discriminated union, the frozen `users` fan out, the backfill to church, dispatch time reminders and in app visibility for any active seat. Each was the recommended pick, and together they form Option 1. The deciding force is the launch date. Option 1 touches the shared notification contract not at all, so nothing outside events can regress, and it follows exactly the frozen audience precedent spec 0013 set for N14. The cost, a late joiner missing an old N16 in the app, is small because the event itself is still visible to them through the live visibility rule, and their reminders resolve when they fire.

Cancel is final because the SRS lists no restore, and a restore would re notify the same audience a second time for a mistake. Making a cancelled event read only, while still allowing archive, removes the one way to send a confusing N17 after a cancellation. Refusing a cancel once the event has ended keeps "Cancelled" meaningful.

For the clan elder, requiring the appointee to be a verified member of that clan follows SRS §3.5 and the clan portal's "own clan" rule. Without it, an elder could lead a clan whose member list the clan portal never shows them. Applying it to the System Admin too keeps one rule in one place. The recent activity card uses an allowlist rather than a denylist so that any new sensitive action (account, cost register, role grants) stays hidden by default. A forgotten allowlist entry costs a missing dashboard line. A forgotten denylist entry would cost a leak.

Hard deleting planned activities is safe because they are internal (A7-02: never shown to members), and nothing else references them. The log snapshot keeps the audit trail. The A1-04 card leaves department activities out to stay legible with 13 departments and 12 clans. The planner is where those live.

### Already built inventory (evidence)

| Story | State | Where |
|---|---|---|
| A2-02, A2-03 | built | `convex/memberProfiles.ts` `sendProfileBack`, `resubmitProfile`, `listSentBack` |
| A2-04 | not built, feature 29 | `memberProfiles.ts` comment near line 715 |
| A4-02, A4-03 | built | `convex/weeklyPrograms.ts` `cancelOccurrence`, `restoreOccurrence` |
| A5-01 times | built | `events/EventDialog.tsx` `DateTimePicker`, end after start check |
| A6-02 | built | `announcements.ts` `pushOnFirstPublish`, `firstPublishedAt` |
| A6-03 | built (mobile) | `apps/mobile/app/(tabs)/updates.tsx` `CategoryChip` |
| A1-03 | bug | `admin.ts` `listRecentActivity` through `getSystemAdminOrNull` (`lib/authz.ts:83`) |
| clan elder authority | System Admin only | `roles.ts`, the `else` branch in both assign and revoke |
| event cancel | read side only | `cancelledAt` written only by `contentSeed.ts` |
| planner group activities | not rendered | `departmentActivities.listAllForPlanner` has no portal caller |
