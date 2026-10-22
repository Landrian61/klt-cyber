# 0008. Account deletion, rationale

The reasoning behind [index.md](index.md). `/develop` does not need this file.

## Context

> ⚠️ Premise note: this design rests on `@convex-dev/better-auth` being able to destroy an identity and end its sessions, and `AGENTS.md` records that integration as alpha, deliberately pinned at 0.12.2, and not to be upgraded casually. Nothing in the repository exercises that call today, so the capability is assumed rather than known. If 0.12.2 cannot do it, the release path changes completely, because an account that keeps a working credential has not been deleted in any sense a store reviewer or a regulator would accept, and the fallback (editing the identity's address instead) is a materially different design. That is why slice 0 of the build plan is a throwaway spike and why nothing else should be written until it passes.

KLT Cyber has no way for a person to leave. Every account created since launch is permanent, which is a problem on three separate fronts at once.

It is a legal problem. Uganda's Data Protection and Privacy Act governs this platform (SRS line 184), and NF-04 commits the church to anonymizing personal data on deletion. The data at stake is not trivial: `memberProfiles` holds phone numbers, dates of birth, home addresses, marital status and a next of kin with their own name and phone, and the `children` table holds records about minors. None of that currently has an exit.

It is a commercial problem. Apple and Google both require that an app offering account creation also offers account deletion from inside the app, and Google additionally requires a publicly reachable web page where deletion can be requested without the app installed (SRS line 183). The pilot launches on 29 November 2026. Without this, there is no store listing.

It is a product problem. F1-06 and M6-06 both promise it, and the confirmation email that tells somebody their account is gone has already been built and shipped in spec 0007, sitting unused behind a comment that names this feature as its caller.

The forces shaping the answer pull against each other. The church wants its history: who served in which department, who gave what, who was the Elder two years ago. The individual wants to be forgotten. Convex offers no joins and no unique indexes, so cardinality rules and referential tidiness are enforced in mutation code rather than by the database. Convex mutations are transactional but cannot reach an external API; actions can reach one but are not transactional, and the identity lives behind exactly such an API. And the team is small, launching in about five weeks, with a build approach that favours thin end to end slices over broad foundations.

The cost of not deciding is a store rejection five weeks before a launch date, with a legal obligation unmet underneath it.

## Options considered

### Option 1: Immediate anonymize in place, reached through two doors

Confirming deletion anonymizes the `users` row and destroys everything personal around it in a single transaction, straight away. The app is one door, behind the current password; a public web page is the other, behind a link mailed to the address itself.

**Pros**:

- Keeps the promise literally. The data is gone the moment the person is told it is gone, with no window in which it still exists.
- One code path serves both doors, so the app and the web page cannot drift apart in what they actually do.
- No scheduled job, no locked intermediate state, and nothing to operate or monitor between request and effect.
- Anonymizing in place keeps every foreign key valid, which matters in a database with no joins to repair them.

**Cons**:

- No undo whatsoever. A mistaken confirmation is final, and the password prompt is the only thing between a tap and permanent loss.
- Anonymized rows live in `users` forever, so every count of accounts or members must now remember to exclude them.
- Each table holding personal data must be wired into the path by hand, and nothing catches an omission.

### Option 2: Grace period with a locked state

Confirming locks the account at once and schedules the anonymizing for seven or thirty days later. Signing in during the window cancels it.

**Pros**:

- Survivable mistakes, which is a real kindness for an irreversible action offered on a phone.
- A locked state is a natural place to send a "you are about to lose this" reminder.

**Cons**:

- The personal data the person asked you to remove is still sitting there for weeks, which is the weakest possible answer to a data protection request and an awkward thing to explain to a regulator.
- Needs a scheduled job, a third account state, and a decision about what a locked account can see, all of which have to be built, tested and operated.
- A store reviewer checking that deletion works sees an account that still exists.

### Option 3: Hard delete the user row

Remove the `users` row outright, along with everything referencing it.

**Pros**:

- The strongest possible answer to "is my data gone", with nothing left to audit or argue about.
- No accumulating rows and no `deletedAt` for every future query to remember.

**Cons**:

- Directly contradicts F1-06, NF-04 and SRS line 1350, which all require an anonymized record to be kept for statistics and audit.
- Every `activityLogs` entry, every `assignedBy`, every `createdBy` pointing at that row becomes dangling, and Convex will not repair them for you.
- Destroys the church's own history alongside the person's data, which is not what anybody asked for.

### Option 4: Admin mediated queue only

Both doors record a request, and a System Admin performs each deletion by hand from a portal screen.

**Pros**:

- A human checks every irreversible action, which is the strongest guard against a mistake.
- No new email template, so the five email rule in SRS line 296 stays untouched.

**Cons**:

- Puts a human delay in front of a legal right, and the delay is unbounded when nobody is watching the queue.
- Costs an admin screen, a queue and an operational habit, for a church with roughly fifty people at launch.
- Still needs the whole anonymizing engine underneath, so it adds work rather than replacing any.

## Rationale

Option 1 wins because the three forces in Context point the same way. The legal obligation is best met by data that is actually gone rather than scheduled to go, which rules out option 2's window. The commercial obligation is best met by a reviewer being able to delete an account and see it deleted, which rules out option 2 again and option 4's queue. And the church's own requirement to keep an anonymized record for statistics and audit, written into F1-06, NF-04 and SRS line 1350, rules out option 3 outright. Anonymizing in place is the only one of the four that satisfies all three at once.

The transactional shape follows from Convex rather than from preference. Because a mutation cannot reach the Better Auth API and an action is not transactional, something has to give. Putting every database write inside one internal mutation and letting an action orchestrate around it means the database can never be found half anonymized, which is the failure that would be genuinely hard to reason about afterwards. The two steps that sit outside the transaction, destroying the identity and sending the email, were chosen for that position because both are safe to retry and neither leaves personal data exposed if it fails. The reverse order, destroying the identity first, was rejected for exactly that reason: its failure mode leaves live personal data behind a credential nobody can now sign in with to try again.

Revoking role and membership rows rather than deleting them may look inconsistent beside deleting profiles and children outright, and the distinction is deliberate. A `roleAssignments` row is a record of a church decision, who appointed whom and when, and it belongs to the church's history. A `memberProfiles` row is a description of a person. The first survives anonymized; the second does not survive at all.

Two choices are worth marking as consciously accepted rather than obviously right. Immediate deletion with no grace period trades away mistake recovery, and a single mistaken confirmation will one day cost somebody their profile with no way back. The alternative was worse for the legal obligation, but the tradeoff is real and the confirmation screen is doing more work here than it would in a design with a window. Second, the deletion path is maintained by hand, so every future table holding personal data depends on somebody remembering to add it. That is the weakest part of this design, it will not fail loudly, and it is carried as a follow up item rather than solved here because solving it properly means a registry and a convention that reach well beyond one feature.

Two parts of the design were corrected by an independent cross check after the first draft, and both corrections are worth recording because the original instincts were wrong in instructive ways.

The first was the order of the file deletes. The draft said R2 objects go before their database rows, which reads naturally and is how you would do it if a single transaction could span both. It cannot: a Convex mutation has no way to reach R2, so the action has to do it, and that means an ordering choice. Deleting files first produces the worst available failure, a photo destroyed while the account that owned it still exists, and it can be triggered by something as ordinary as the last System Admin check refusing the deletion a moment later. Deleting them after the commit produces the better failure, orphaned bytes nothing points at. Neither is free, but one is recoverable and the other is not, so the irreversible step now runs last and every refusal check runs first.

The second was that the deleted state is an authorization boundary, which the draft missed entirely. `convex/lib/authz.ts` resolves a caller by `by_authId` and asks nothing else. That is correct today, because an identity and a user row are created and destroyed together. This feature breaks that pairing: it anonymizes the row inside a transaction and destroys the identity outside one, so a failure in between leaves a working credential pointing at an anonymized row. Without a guard that account can keep acting, and it would do so with an empty profile and no name attached to anything it did. Putting the `deletedAt` check in the resolver rather than in each caller means the guarantee holds for every function written afterwards, including the ones nobody has thought of yet.

The sixth email template is a deliberate amendment, not an oversight. SRS line 296 fixes the list at five events and `convex/lib/emails/templates.ts` enforces it with a closed `Record<EmailTemplate, ...>` whose comment says a sixth template should be a compile error rather than a review catch. That wall was built on purpose, so crossing it is recorded on purpose: the deletion request link only ever sends when somebody explicitly asks for it, which adds no unsolicited volume and no deliverability risk, and those are the risks the five email rule exists to control. The alternative, option 4's admin queue, avoided the sixth template only by putting a person in front of a legal right.
