# 0023. My Profile and settings: rationale

The decision record behind [index.md](index.md). `/develop` builds from the index; this file explains why.

## Context

Feature 14 in `docs/scope/scope.md` (Track B, Beta, Week 4) asks for one screen where every user sees and changes everything about themselves: profile, sharing, notifications, account (SRS M6-01 to M6-07, F5-11). The workspace is `apps/mobile`, with a small read in `convex/` and constants in `packages/shared`.

Much of it already exists, unevenly. `apps/mobile/app/profile.tsx` (789 lines) shows the profile read only, with the real mentorship label, a clan change control, the `MyAreasOfService` component, the directory sharing switch, the push permission row, a link to followed radio programs, Sign out and Delete account, all stacked as cards. Its Edit button is a stub that only buzzes. Spec 0014 built the backend for self service editing (`updateMyProfile` with `clearFields`, row scoped children and leadership mutations, the mentorship gate in both directions, the R2 photo cleanup), and the portal Settings page uses it, but no mobile screen calls `updateMyProfile`. There is no view of roles, no portal pointer, no change password, and no Help & Support.

Two neighbouring features own parts of M6. Feature 28 owns F4-19 (muting notification categories) and lists M6-05. Feature 29 (Track A) owns F2-14 and A2-04 (a "Completed" mentorship change waiting for Administration). Track B proposes schema changes but Andrew owns the schema, so a Track B feature that needs no schema moves faster. Launch is 29 November 2026; F1-04 (change password) is marked optional for launch. Google sign in is configured, so some accounts have no password.

## Options considered

### Option 1: Profile and Settings split, reusing the 0014 backend

Profile becomes an identity screen (details, clan, areas, roles, portal pointer) with Edit and a gear. Settings groups Privacy, Notifications, Account, Help. A new edit screen with sections and one Save. One new read only query for roles and the portal rule.

**Pros**:
- Familiar pattern; each screen stays short.
- No schema change; reuses every 0014 mutation.
- Gives features 28 and 29 a clear slot.

**Cons**:
- Sign out and Delete move one tap deeper.
- Restructures a large, shared screen.

### Option 2: One long profile screen

Add the missing cards to `profile.tsx` and keep everything in one scroll.

**Pros**:
- Least navigation; smallest change to routing.

**Cons**:
- An already long screen grows further; choices and identity mix.
- Edit still needs its own screen, so the "one screen" ideal breaks anyway.

### Option 3: Grouped menu hub

Profile becomes a header plus rows (My details, My church life, Privacy, Notifications, Account, Help), each its own screen.

**Pros**:
- Very scalable; each area is isolated.

**Cons**:
- The most screens to build; seeing your own details takes an extra tap.

### Option 4: Edit through the wizard in edit mode

Reuse the seven profile completion steps pre filled, as sent back already does.

**Pros**:
- Reuses step UI and validation.

**Cons**:
- Fixing one phone number means walking seven steps; the wizard's flow and copy are about submitting, not maintaining.

## Rationale

The scope's intent is "one place to see and change everything about yourself", and the split serves it better than one long screen: the profile answers "who am I here", Settings answers "how does the app treat me". Option 2 fails on length and on mixing two jobs; Option 3 costs the most screens for a 50 minister pilot. Option 1 also fits the team reality: it needs no schema, so Track B doesn't wait on Andrew, and it reuses spec 0014's backend instead of adding to it.

For editing, one sectioned screen with one Save fits a "fix one thing" job better than the wizard (Option 4). Children and leadership save per row because their mutations are already row scoped; folding them into one Save would invent partial failure across many calls. Last write wins is acceptable because only changed fields are sent, so the only loss is the same field edited in two places at once, which is rare for a person editing their own profile.

The roles and portal rule live in one new query because the rule (any role, or a confirmed Media, Hospitality or Library member) is a server fact, and `getMyRoles` throws during sign out. The support contact is a shared constant because it is one rarely changing value and an admin setting would need storage and a portal page. Changing password signs out other devices because a password change usually follows worry about access. Feature 28 and 29 content stays out so each feature has one owner; this spec leaves their slots and says so in its Follow-up.
