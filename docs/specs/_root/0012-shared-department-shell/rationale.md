# 0012. Shared department shell: rationale

The reasoning behind [index.md](index.md). Not read during a build.

## Context

The web portal has thirteen Areas of Service and exactly two real portals. Administration has a full module under `areas-of-service/admin/` and Media has a smaller bespoke one under `areas-of-service/media/`. Every other department routes to `areas-of-service/[slug]/page.tsx`, which resolves the department name and renders a hammer icon with the words "Coming soon". Spec 0006 widened the portal gate so Media, Hospitality and Library roster members can sign in and reach their department, and its own follow up noted that the "Coming soon" skeleton would need to become a real page once this feature ran. That is the gap: people can get in, and there is nothing behind the door.

Five of the remaining features in the build plan (Pastoral, Finance, Hospitality, Library, Real Estate) are described in the SRS as adding department specific pages on top of a shell that is assumed to exist. Media's own permission table marks its Roster, claims, positions and delegates rows as "Shell". So the shell is not one more department portal; it is the thing five later features and one existing portal are all written against. Building it as a single page for a single department would mean building it five more times.

The foundations are unusually complete. Spec 0006 settled the permission model: `hasPortalAccess`, department scoped roster reads, the HOD and delegate distinction, and backend permission tests. Spec 0010 went further and shipped the member facing half of two tables, `groupActivities` and `groupMessages`, deliberately with no authoring interface, with a comment naming features 17 and 23 as the writers and leaving the activity reminder fields unset because this feature owns the reminder tiers. The mobile app already reads both. The roster mutations (`addDepartmentMember`, `updateDepartmentMembership`, `removeDepartmentMember`) already exist with their audit entries and their role revocation cascade. So most of this feature is the authoring side of contracts that are already agreed and already consumed.

One thing in the SRS has no implementation at all, and it is not a page. SRS S3-04 to S3-06 describe pending claimants: people who asked to serve in a department, shown in a separate marked section, confirmed or declined by the HOD with the person notified either way. Today `submitProfile` writes a member's self selected Areas of Service straight into `departmentMemberships` with `status: "active"`, and the status union has only `active` and `removed`. There is no state in which a request exists but a membership does not. Every roster in the system therefore contains seats nobody authorised, and the department notification audience (which resolves to verified roster members) already sends to them. The twin of this gap sits in feature 9 as F2-07, "adding an Area of Service creates a pending claim", which is unbuilt and unspecified. Whichever of the two features designs the claim first defines the contract for both.

## Options considered

### Option 1: One dynamic `[slug]` portal, bespoke portals link out to it

Build the five pages only inside `areas-of-service/[slug]/`. Media keeps its own portal for Radio, Devotionals and Past events, and its sidebar links out to the generic shell for Roster, Activities and Messages.

**Pros**:
- Smallest amount of code and exactly one place where each page exists.
- No new convention to learn; it is ordinary Next.js dynamic routing.

**Cons**:
- A Media user bounces between two shells with different sidebars and different headers, which is precisely the "recognisably the same product" rule in `AGENTS.md` broken inside one department.
- The five later department features each need their own pages beside the shell pages, so each one faces the same bounce. The problem is deferred, not solved.

### Option 2: Shared page components and shared Convex functions, hosted by `[slug]`

Build the five pages as shared React components over a shared Convex surface. The `[slug]` route mounts them and is the complete portal for any active department with nothing bespoke. A bespoke portal imports the same components and renders them inside its own layout beside its own pages.

**Pros**:
- One implementation of each page, and every department keeps one coherent portal with one sidebar.
- The five later department features mount the shell and add their own pages, which is the arrangement the SRS already assumes.
- The Convex surface is shared independently of the rendering, so correctness of permissions lives in one place regardless of which portal calls it.

**Cons**:
- Introduces a convention (shared page components parameterised by department) that does not exist in the repo yet and needs writing down, or later features will copy pages instead.
- The shared components must take their department from a prop rather than reading the route, which is slightly more ceremony at each call site.

### Option 3: A page set per department portal

Give every department portal its own copy of the five pages, starting with Media and the generic route.

**Pros**:
- Each department can diverge freely without affecting the others, and there is no shared abstraction to design.

**Cons**:
- Seven or more copies of a roster page with identical permission logic. The permission matrix in SRS 4.7.2 would be re derived per copy, which is how a delegate ends up able to remove a member in one department and not another.
- Directly against the project's stated no duplication rule for shared contracts.

### Claim modelling, considered separately

**Widen `departmentMemberships.status`** (chosen): add `pending_claim` and `declined` to the existing union with the decision fields. One table remains the whole truth about who relates to a department and how. The roster read already filters on status, so the pending section is one more indexed read on an index that exists. The cost is that every existing membership read must be checked for an assumption that a non removed row is an active one.

**A separate `departmentClaims` table**: a cleaner conceptual split, since a claim genuinely is not a membership. Rejected because confirming a claim then becomes a two table transaction (delete the claim, insert the membership), the roster read must union two sources to show one list, and the history of a person's relationship to a department is split across two places. Also loses the audit continuity of a single row moving through states.

**An embedded approval state object**: matches the repo's documented approval state shape for records needing verification. Rejected because a pending claimant would be an `active` membership carrying a non confirmed sub object, so any read that forgets to check the sub object silently treats a claimant as a member. The failure mode is invisible and the blast radius is every roster and every department notification audience.

## Rationale

Option 2 is chosen because the forces in Context are not about this department, they are about the five that follow. The SRS describes Pastoral, Finance, Hospitality, Library and Real Estate as adding pages to a shell, and Media's permission table already names its roster and activities rows as shell responsibilities. A design that produces one working portal but no reusable shell satisfies the scope row and leaves five features to rediscover the same pages. Option 1 is genuinely cheaper today and would be the right call if only the generic route ever needed these pages, but Media already disproves that premise, and the bounce between two different looking shells inside one department conflicts with the shared design language rule in `AGENTS.md`. Option 3 fails on the permission matrix alone: SRS 4.7.2 is a twelve row table of HOD versus delegate powers, and the one thing that must not be copied seven times is an authorisation rule.

Widening the membership status, rather than adding a claims table, follows from how the data is already read and written. The roster read filters by status on the `by_departmentId_status` index, so a pending section costs one more read on an index that already exists, and confirming a claim is a single `patch` that leaves one row carrying its own history from request to decision. The embedded approval object was the closest rival and is the shape the project's own conventions suggest for records awaiting verification, but it was rejected on failure mode rather than elegance: it leaves a claimant as an `active` row, so the dangerous case is a read that forgets a check, and the consequence is a claimant counted as a member and included in a push audience. Making the status itself carry the distinction means a careless read fails loudly in the type system instead of quietly in production.

This feature takes the whole claim contract, including the `submitProfile` write path that technically belongs to feature 9's area, because the alternative is a build that ships a pending claimant section that is always empty. Splitting the contract so that one feature can confirm claims and another creates them means the confirm and decline flows cannot be exercised, cannot be verified, and cannot be tested against real data until the other feature lands. The edit to `submitProfile` is small and well understood: one status value changes at one insertion point. Feature 9 then reuses the same contract for its post verification path, which is why it appears in the Follow up list rather than being left to discover the shape independently.

The day before only reminder tier follows the same reasoning as the rest: the catalogue lists N23 as a single "department activity reminder" row, not a tiered series, and a department activity is typically scheduled days out rather than weeks. Mirroring the church event cadence of seven days and one day would add a reminder that fires before many activities are even created, plus a second schedule and cancel path to keep consistent on every edit. One reminder is the smallest thing that satisfies the requirement, and a second tier can be added later without changing the data model beyond one more optional field.

An independent cross check corrected two things in the first draft of this spec, and both are worth recording because the corrections point in the opposite direction to the author's intuition.

The first was the direction of the risk. The draft named "existing reads that filter `status !== "removed"`" as the feature's main regression risk and made auditing them a build task. A scan of the backend and both apps found **no such read anywhere**: all twenty five existing reads of `departmentMemberships` filter on `status === "active"`, so widening the union cannot make any read mistake a pending claim for a member. The real exposure is the inverse, and it is in writers rather than readers. `addDepartmentMember` and the appointment insert in `roles.ts` both check only for an **active** row before inserting one, so adding or appointing someone who already holds a pending claim would create a second live row and show that person on the roster twice, once as active and once as awaiting confirmation. `submitProfile` has no duplicate check at all, so a retry could produce two pending claims that a single confirmation would not reconcile. The Administration verification read filters to active, so the draft's claim that it would "also carry the status" was simply false: a reviewing admin would have seen no claimed Areas of Service at all. And `accountDeletion.performDeletion` patches only active rows, so a leaving user's declined claim would have survived deletion still carrying the free text reason and the deciding user's id, quietly breaking spec 0008's promise. Those five fixes became a build slice of their own, sequenced before any claim can be created, and the invariant "at most one live row per user and department" was added to carry the rule the writers now enforce.

The second was an over grant. The draft's security model let a plain roster member of Media, Hospitality or Library read a department's Dashboard and Roster, on the reasoning that spec 0006 had widened the portal gate for exactly those three departments. SRS 4.9.2 says otherwise: the Media roster member column reads "No" for roster, claims, positions and delegates, and "receive only" for activities and messages. Spec 0006's gate exists so those members can reach their department's own bespoke pages, not so they can read a roster. The shell is now HOD, delegate and System Admin only, which also resolved an internal contradiction, since the draft's own roster and dashboard gates had already excluded the roster member the security table admitted. The same pass narrowed Administration authority: it keeps the active roster read spec 0006 gave it, and is now explicitly denied the pending claimants list and the sharing bypassed profile, neither of which SRS 4.7.2 grants it.

Two value sourcing gaps closed in the same pass are worth naming. Activity times had no stated timezone, which for a church in Kampala with leaders who travel is a wrong instant waiting to happen; they now reuse the existing `KAMPALA_UTC_OFFSET_MS` rather than a second definition. And several acceptance criteria turned on "has this time passed", which a Convex query cannot answer reactively, because a query re runs when data changes and not when the clock moves. Those reads now take an explicit `now` argument from the client so the subscription re runs as the client advances it, which is a correctness fix rather than a style choice.

The `activityLogs` department scoping deviates from the literal option that was chosen in conversation, which named an index on `metadata.departmentId`. That is not buildable: `metadata` is typed `v.optional(v.any())` and Convex can only index a path it has a declared type for. The intent behind the choice (an indexed read bounded by one department, rather than a scan of all church activity filtered in memory) is preserved exactly by promoting `departmentId` to a top level optional field with its own index. The alternative within the same intent, declaring a typed shape for `metadata`, would force every existing writer of that field across the whole backend to conform, which is a far larger change for no benefit to this feature.

## References

**Project sources** (verifiable in this repo):
- `spec/SRS.md` section 4.7, the shared department shell: the Pages table, the HOD and delegate powers matrix in 4.7.2, and stories S1 to S6
- `spec/SRS.md` section 5, the notification catalogue: N10 to N12 for claims and roster changes, N22 to N25 for activities, messages and HOD notices, and the delivery rule that pending claimants never receive department activity or message notifications
- `spec/SRS.md` section 4.9.2, Media's permission table, which marks Roster, claims, positions and delegates as "Shell"
- [spec 0006](0006-department-scoped-permissions/index.md), department scoped permissions: `hasPortalAccess`, the department scoped roster reads this feature builds on, and its follow up naming this feature as the one that replaces the "Coming soon" skeleton
- [spec 0010](0010-updates-events-programs/index.md), Updates, Events and Programs: the `groupActivities` and `groupMessages` contract, shipped with no authoring interface and with the activity reminder fields deliberately left for this feature
- `convex/schema.ts`, the comments on `groupActivities` and `groupMessages` naming features 17 and 23 as the writers
- `convex/departmentMemberships.ts`, the existing roster mutations, the role revocation cascade on removal, and the comment recording that self added roster rows bypass department authority and profile verification
- `convex/memberProfiles.ts` `submitProfile`, the write path that currently creates active memberships from self selected Areas of Service, and the Administration verification read above it that filters those memberships to active only
- `convex/roles.ts`, the appointment path that implicitly adds an appointee to the roster by inserting an active membership when no active one exists
- `convex/accountDeletion.ts` `performDeletion`, which transitions only active memberships and so would have missed the new statuses
- `packages/shared/src/constants/weeklyPrograms.ts`, the existing `KAMPALA_UTC_OFFSET_MS` and `kampalaToday` that church local time reuses, and `convex/calendar.ts` which already derives its offset from them
- `spec/SRS.md` section 4.9.2, the Media permission table whose roster member column is what limits the shell to HOD, delegate and System Admin
- root `AGENTS.md`, the two orthogonal permission dimensions rule, the shared design language rule, the "no hand rolled component" rule for the admin portal, and the instruction to load the `klt-cyber-web-ui` skill for web work
- `convex/AGENTS.md`, the conventions that every mutation checks its role through `lib/authz.ts`, that every consequential state change writes an `activityLogs` row, and that cardinality is enforced in the mutation

**Practices and standards**:
- Make the illegal state unrepresentable: a pending claimant is a distinct status rather than an active row carrying a flag, so a read that forgets the check fails in the type system rather than in a push audience
- Enforce authorisation at the innermost layer: the Convex function is the boundary, and the middleware and route layout are user experience only
- Encode a permission matrix once: one derived capability object plus one server side assertion helper, rather than a rule re implemented per page
- Additive schema change over migration: widening a union and adding optional fields keeps existing rows valid, which is what makes grandfathering current memberships free
- Cancel as a state, not a delete: a cancelled activity keeps its place in the list until it passes, the same two state split the `events` table already uses
- Soft delete confined to an audited record: used for department messages because S5-03 needs the audit trail, and deliberately not used for claims, where a new row records a new request
