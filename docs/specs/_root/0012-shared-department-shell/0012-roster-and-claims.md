# 0012b. Roster and the claim lifecycle

Child of [0012 Shared department shell](index.md). Covers S3-01 to S3-10 and acceptance criteria **AC-10** to **AC-21**, plus **AC-39** (deletion of the new statuses).

## Summary

The Roster page and the one genuinely new concept in this feature: a pending claim. Today a person's self selected Areas of Service become active roster seats nobody authorised. This child introduces `pending_claim` and `declined`, flips the signup write path to create requests, and gives the HOD confirm and decline actions with notifications and audit entries. The larger half of the work is not the new mutations: it is teaching four existing writers and one existing read that a membership can now be pending.

## Design

### Status lifecycle

```
(absent) ──submitProfile, or add an area later (feature 9)──► pending_claim
pending_claim ──confirmClaim (HOD)──► active
pending_claim ──addDepartmentMember, or role appointment (promote, never duplicate)──► active
pending_claim ──declineClaim (HOD, optional reason)──► declined
active ──removeDepartmentMember (HOD)──► removed
(absent) ──addDepartmentMember (HOD or delegate, verified member)──► active
```

**At most one row per user and department is ever `pending_claim` or `active`.** This is the invariant every writer below has to respect. `declined` and `removed` are terminal; a person who claims again gets a new row, so the sequence of decisions stays legible.

New fields: `claimedAt`, `decidedBy`, `decidedAt`, `declineReason`. All optional, so existing rows stay valid and no migration runs.

### The existing code that must change first

This was verified against the code, not assumed. Every existing read of `departmentMemberships` filters on `status === "active"` (25 call sites across `convex/departmentMemberships.ts`, `notifications.ts`, `roles.ts`, `lib/authz.ts`, `lib/groupMembership.ts`, `accountDeletion.ts` and `memberProfiles.ts`). **There is no `status !== "removed"` read anywhere.** So widening the union cannot make a read mistake a pending row for a member. The real defects are the opposite: writers that check only for an active row, and one read that needs pending rows and will not get them.

| Location | Problem after the widening | Fix |
|---|---|---|
| `memberProfiles.ts` verification read (around line 154) | filters `status: "active"`, so a reviewing admin sees **no** claimed Areas of Service for a freshly submitted profile | widen to `active` plus `pending_claim`, returning the status so the reviewer can tell them apart (**AC-21**) |
| `departmentMemberships.addDepartmentMember` (around line 48) | checks only active rows, so adding someone who already has a `pending_claim` row inserts a second row and the roster shows them as active **and** awaiting confirmation | look for a `pending_claim` row for that pair first and promote it (patch to `active`, set `decidedBy` and `decidedAt`); insert only when no live row exists |
| `roles.ts` appointment insert (around line 202) | same check, same duplicate: appointing an HOD or delegate who has a pending claim inserts a second active row | same promote rule |
| `memberProfiles.ts` `submitProfile` (around line 285) | no dedupe at all, so a retry or a later claim can create two `pending_claim` rows for one pair, which `confirmClaim` would then double confirm | reject when a `pending_claim` or `active` row already exists for that pair |
| `memberProfiles.ts` `submitProfile` audit (around line 293) | writes `department.member_added` with `selfService: true`, which after the flip describes something that did not happen | write `department.claim_created` instead, carrying `departmentId` |
| `accountDeletion.performDeletion` (around line 651) | patches only `active` rows, so a leaving user's `pending_claim` and `declined` rows survive, still carrying `declineReason` and `decidedBy` | extend to the new statuses and clear `declineReason` (**AC-39**, and spec 0008's promise that personal data goes) |

These land in slice 2 of the umbrella build plan, **before** any claim can be created.

### Roster read

`listRosterWithClaims({ departmentId })` returns two lists from the existing `by_departmentId_status` index:

- `active`: membership joined to `memberProfiles` (display name, photo through `resolveMediaUrl`, clan name, mentorship status) and `positionTitle`, sorted by last name then first name
- `pending`: the same join for `pending_claim` rows plus each claimant's `profileStatus`, sorted by `claimedAt` ascending (falling back to `_creationTime` for a legacy row) so the longest waiting claim is first

Gating is narrower than the read it replaces:

| Caller | Gets |
|---|---|
| this department's HOD or delegate, System Admin | both lists, full joins |
| Administration authority | `active` only, without the sharing bypassed profile fields and without `declineReason` |
| anyone else, including a plain roster member | `null` |

Administration authority is deliberately excluded from the pending list. Spec 0006 gave it the active roster of any department and that stays, but SRS 4.7.2 grants the claimants list to the HOD and delegate columns only, and a claimant's `profileStatus` is information about a person's verification state that another department's leaders have no need for.

Mentorship status is read live from `memberProfiles.mentorshipStatus` (`not_enrolled`, `enrolled`, `completed`). It is never copied onto the membership row and never hardcoded, which is the mistake F2-11 records on the mobile side.

Search and filter run on the returned list in the client. One department's roster is tens of rows, so a server side search would add a round trip for nothing. Clan filter options come from the `clans` table; position options are the distinct non empty `positionTitle` values present on this roster.

`getRosterMemberProfile({ departmentId, userId })` is the one function that bypasses directory sharing, per S3-02. It is gated to this department's HOD and delegate plus System Admin, and nobody else, so the carve out lives in exactly one place and cannot widen by accident.

### Pending and grandfathered labels

Three states look similar in a list and must read differently:

| Row | Label | Confirm button |
|---|---|---|
| `pending_claim`, claimant's profile `verified` | "awaiting confirmation" | enabled |
| `pending_claim`, profile not verified | "not yet verified" | disabled, with the reason shown |
| `active`, profile not verified (a grandfathered self added row) | "not verified" | not applicable |

The third row is why the roster count and the dashboard's verified member count legitimately differ. Both numbers are correct; the label is what makes them explainable rather than contradictory.

### Confirm and decline

`confirmClaim({ membershipId })`, HOD or System Admin only:

1. the row exists and its status is `pending_claim`, else reject
2. the claimant's profile is `verified`, else reject with the explaining message
3. the claimant holds fewer than `MAX_ACTIVE_DEPARTMENTS` active memberships, else reject
4. patch to `active`, setting `decidedBy` and `decidedAt`
5. notify the member (N11) and write a `department.claim_confirmed` audit row carrying `departmentId`

No application lock is needed. Convex mutations are serialisable over their read set, so two confirms that both read the claimant's active rows conflict and one retries, then fails the status check. A defensive lock would be dead code.

`declineClaim({ membershipId, reason? })`, HOD or System Admin only: the row must be `pending_claim`; patch to `declined` with `decidedBy`, `decidedAt` and the trimmed reason capped at `CLAIM_DECLINE_REASON_MAX_LENGTH` (280); notify the member with the reason (N11); write `department.claim_declined`. A blank or whitespace only reason stores as absent, matching how `positionTitle` and the program cancellation reason already behave. `declineReason` is returned only to the claimant and to that department's HOD.

### Existing mutations surfaced

`addDepartmentMember` (HOD and delegate), `updateDepartmentMembership` (HOD only, position title, with its existing no op rule) and `removeDepartmentMember` (HOD only, with its role revocation cascade) already exist with their audit entries. This child gives them an interface, adds `departmentId` to their audit entries, and adds the promote rule to `addDepartmentMember`.

Delegate appointment and removal goes through the existing `roles.ts` path with `roleType: "department_admin"`, restricted to verified roster members of this department, notifying N13 on appointment and N15 on removal, and writing `department.delegate_appointed` and `department.delegate_removed` with `departmentId` so both appear in the dashboard feed. No cap on delegates per department is imposed, since the SRS states none.

`addDepartmentMember` already rejects an unverified member and already enforces the three department cap, so the confirm path and the add path agree without duplicating the rule.

## Build tasks

1. Widen `departmentMemberships.status` with `pending_claim` and `declined`, add the four claim fields, and add the status union plus `CLAIM_DECLINE_REASON_MAX_LENGTH` (280) to `packages/shared` with tests, satisfies **AC-14**.
2. Fix the six existing locations in the table above: the verification read, the two promote sites, the `submitProfile` dedupe and its audit action name, and `performDeletion`. This runs before any claim can exist, satisfies **AC-15**, **AC-21**, **AC-39**.
3. Build `listRosterWithClaims` with its two lists, its sorts and its narrowed Administration shape, and `getRosterMemberProfile` for the sharing bypass, satisfies **AC-10**, **AC-11**, **AC-13**.
4. Build the shared Roster page: the active table (photo, name, clan, position, real mentorship status), search and filter, the full profile view, the three labels, and the separate pending section, satisfies **AC-10**, **AC-11**, **AC-12**, **AC-13**.
5. Flip `submitProfile` to write `pending_claim` with `claimedAt`, satisfies **AC-15**.
6. Build `confirmClaim` and `declineClaim` with their validation order, the N11 notification and the audit entries, wired behind `can.confirmClaim` and `can.declineClaim`, satisfies **AC-16**, **AC-17**.
7. Surface add, re title, remove and delegate appointment behind their capabilities, add `departmentId` to their audit entries, and add N12, N13 and N15 where missing, satisfies **AC-19**, **AC-20**.
8. Confirm by test that a delegate is rejected server side on confirm, decline, set position, remove and manage delegates, and that Administration authority is rejected on `getRosterMemberProfile`, satisfies **AC-18**, **AC-11**.

## Rationale (short)

Widening the status keeps one row as the whole truth about a person's relationship to a department, so confirming is a single patch and the row carries its own history. A separate claims table would make confirmation a two table transaction and split that history. An embedded approval object was closer to the repo's documented approval shape but leaves a claimant as an `active` row, so a read that forgets the extra check silently counts a claimant as a member and includes them in a push audience; making the status itself carry the distinction turns that class of mistake into a type error.

The signup write path moves here rather than to feature 9 so the confirm and decline flows can actually be exercised when they ship. The cost is that this child has to fix four existing writers, which is why that work is a slice of its own placed before the new mutations rather than folded into them.

## Edge cases

- Confirming a claim that is no longer `pending_claim` rejects on the status check. There is at most one HOD per department, so this is a retry rather than a race, and Convex's serialisable mutations make it safe either way.
- A claimant whose profile is sent back and resubmitted keeps the same pending claim; the claim is about the department, not the profile revision.
- A claimant who is declined and claims again gets a new row. The declined row stays for the record and is not shown in either roster list.
- A claimant who reaches three active departments through other confirmations first is rejected at step 3 with the cap message, not silently confirmed as a fourth.
- A member can hold three pending claims while fewer than three are confirmed. `submitProfile` caps the number of selections and `confirmClaim` counts only active rows; this is recorded as an accepted consequence in the umbrella Follow up rather than an extra rule.
- Removing a member who holds `hod` or `department_admin` in that department revokes the role in the same mutation, which the existing cascade already does.
- A membership row whose profile is missing renders with a null profile rather than crashing, the same defensive join `listDepartmentMembersWithProfiles` already documents.
- A grandfathered active row belonging to an unverified profile stays on the roster, labelled, and is excluded from the verified count. It is never retroactively demoted to a claim.
- Pending claimants are excluded from every count and from the department notification audience, which already resolves to verified roster members only.
- A member's own view of their Areas of Service is not changed by this child. Whether any mobile screen shows it, and would therefore appear to lose a pending claim, is an open item in the umbrella Follow up.
