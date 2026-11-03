# Rationale: Library catalogue, free content, stock · spec 0015

## Context

> ⚠️ Premise note: the scope reads feature 25 as a self contained Track B catalogue, but it cannot be built as one. SRS 4.13.2 gives every Library roster member full operational access, and the shared department shell (spec 0012) has no role that can express that, so satisfying 4.13.2 means editing the portal's central authority code rather than writing a Library module beside it. L2-02 is the second widening: playing audio in the app needs a native dependency the mobile app has never carried, so this feature also changes how it ships. Both are worth naming now, because treating them as Library's internal business is how the authority model ends up forked and how a week 3 slice stalls waiting for an APK. The right framing is that feature 25 carries two pieces of shared platform work, and the plan below puts them first rather than discovering them halfway through.

Library & Information is one of the three departments whose roster members are meant to work in the portal without holding a role (F3-19). Today none of them can do anything inside a department. Spec 0006 widened the front door with `hasPortalAccess`, and spec 0012 built the five page shell, but the shell's authority resolver, `resolveDepartmentShellRole`, returns null for anyone who is not that department's HOD, its delegate or a System Admin. Its own doc comment says this is deliberate, on the grounds that SRS 4.9.2 gives a roster member no shell pages. That reasoning holds for the five shared pages and fails for Library's own three, which SRS 4.13.2 hands to the whole roster. Something has to give, and the choice is between widening the shared resolver once or standing a second authority model beside it.

The product problem underneath is simpler. The church carries books, flash disk packages, teaching materials, manuals and branded merchandise, and sells none of it through the app: SRS 4.13.1 rules out payments, sales records, ordering and paid digital content for Phase 01. So the catalogue's whole job is to let a member find out what exists, what it costs and whether it is in stock, and then reach the Library desk in one tap. Alongside that sits free material, PDFs and recordings, which members should be able to use without leaving the app at all. The Library team's job is to keep that list and those counts honest, with a note on every stock movement and a warning when something is running out.

The forces that actually shaped the design: the catalogue is small, a few hundred items at most for a congregation this size, so nothing here justifies search infrastructure. R2 and its auth gated gateway already exist, so file storage is a solved problem and the only open question is what the phone does with a file once it has one. The mobile app has no audio and no PDF capability at all, and Radio core needs audio in week 4 regardless, so whichever way Library goes, the decision belongs to both features. And the launch is 29 November 2026 with roughly 50 ministers, so operational simplicity beats generality everywhere the two conflict.

Not deciding has a specific cost. Library is a week 3 feature and Real Estate sits beside it in the same week, needing its own extra pages on the same shell and its own one tap contact. Whatever pattern Library sets, Real Estate inherits within days.

## Options considered

### Option 1: a Library module beside the shell

Keep `resolveDepartmentShellRole` exactly as it is and give Library its own authority check, an `isLibraryOperator` helper accepting HOD, delegate, active roster or System Admin, used by the Library functions only. Serve the three pages from a static `areas-of-service/library/` route tree, the way Media's bespoke portal already works.

**Pros**:
- Touches no shared code, so nothing another in progress feature depends on can regress, and there is no rebase risk in a busy week.
- The Library pages can be laid out freely, without fitting the shell's navigation and chrome.
- Smallest possible blast radius if the roster access rule turns out to be wrong.

**Cons**:
- Two authority models in one portal. A reader of `authz.ts` sees one matrix; a reader of the Library functions sees another, and the two can drift apart without any type error.
- A static `library/` route tree shadows `[slug]` for every path beneath it, so Library would also need its own copies of Dashboard, Roster, Activities, Messages and Settings, re introducing exactly the duplication spec 0012 removed.
- F3-19 stays unbuilt for Media and Hospitality, so the same problem returns twice more.

A middle version of this option exists and was weighed: keep `resolveDepartmentShellRole` untouched, and gate only the three new `[slug]` pages on a Library specific `isLibraryOperator` check. It avoids widening the role union and leaves spec 0012's behaviour exactly as it is, at the cost of the two authority models above. It was put to the engineer as the second option during the design conversation and they chose the fourth shell role, accepting the wider edit in exchange for F3-19 being finished once.

### Option 2: one item table on the shared shell, with a fourth shell role (chosen)

Add `roster` to `DepartmentShellRole`, resolved from a verified active membership in a `ROSTER_PORTAL_DEPARTMENTS` department. Add a `manageLibrary` capability granted only for Library, and give `departmentCapabilities` the department name so a capability can be department specific. Host Catalogue, Free content and Stock as three new segments on the existing `[slug]` route, each gated on that capability. Model the catalogue as one `libraryItems` table split by a `format` axis rather than by paid and free.

**Pros**:
- One authority model. The capability object the shell already computes stays the single source of truth, and the three new pages are gated by the same mechanism as every existing one.
- F3-19 is finished for all three departments at once, and the next department with its own pages adds a capability rather than a route tree.
- One item table gives one cover pipeline, one search surface and one member browse, so free content is found beside everything else.
- Nothing new to operate: three tables, the existing R2 gateway, the existing notification plumbing.

**Cons**:
- Edits central files several in progress features also touch, and changing the `departmentCapabilities` signature ripples to every caller.
- `/areas-of-service/finance/catalogue` is a route that exists and is never reachable, which is slightly odd to read even though it fails closed.
- Widens a week 3 feature with shared platform work before any Library behaviour is visible.

### Option 3: two tables, paid and free kept apart

Keep `libraryItems` for things sold at the desk and add a separate `libraryFreeContent` table for PDFs and recordings, each with its own authoring page and its own member surface.

**Pros**:
- Each table holds only fields that always apply, so there are no conditional columns and no mutation rule policing which fields may coexist.
- The free content surface could evolve independently later, for example into a resource library with its own structure.

**Cons**:
- The two share almost every field, so cover handling, category filing, search and the member browse are all built and maintained twice.
- L1-05's browse and search would reach only half the Library unless a third query merged them, which puts the conditional logic back and adds a join.
- The dashboard's "free content highlights" card and the catalogue's own counts would read from two places that can disagree.

## Rationale

Option 2 wins on the force that actually matters here, which is that Library is not the last department to need this. Real Estate is in the same week and Hospitality is in week 4, both with their own pages and their own contact number. Option 1's cost is not the code it writes, it is that the same work recurs twice more and the portal ends up with three authority models. Widening `resolveDepartmentShellRole` once, in the file whose whole purpose is to answer "who is this caller for this department", is the cheaper total.

The objection to Option 2 is real and it is the rebase risk. `departmentCapabilities` has twelve call sites across `departmentShell.ts`, `departmentMemberships.ts`, `groups.ts` and the shell tests, so a required new argument would touch all of them during the busiest week of the build. Making the department name optional reduces that to the one call site that actually needs it, which is why the spec specifies it that way rather than as a plain second parameter. The authority thread also sits in slice 3, before any Library behaviour: it is the piece most likely to collide with another branch, so it lands early and small rather than buried inside a large catalogue change at the end of the week. The capability object is already the mechanism the sidebar and every mutation read, so adding a department specific capability to it is an extension of the existing design rather than a new idea.

One table over two (Option 3) follows from the same reasoning about which fields are really shared. Title, description, category, author and cover are common to everything the Library carries; what differs is whether the thing is an object on a shelf or a file in a bucket, and that is one axis, cleanly expressed as `format`. Splitting on paid against free would have been splitting on the wrong thing anyway, since SRS 4.13.1 makes every digital item free in Phase 01, so the paid and free split is a consequence of the physical and digital split rather than an independent fact.

Two choices here run against general best practice, and both are deliberate. Storing `quantityOnHand` is a derived value, which usually goes stale; it is kept because the alternative makes every member browsing the catalogue read a movement history per item simply to print "Out of stock", and the invariant is enforced in the one mutation allowed to write it. Soft deleting an item is also normally wrong, because it pollutes queries; it is kept because L3-02 requires the stock movements to be logged, and a movement pointing at a row that no longer exists is not a log. The compromise is that the row is soft deleted while the files are really deleted, so storage does not grow with every retired teaching.

The two mobile tool choices split because the constraints differ. PDFs get the in app browser sheet because `expo-web-browser` is already installed, the device renders the file with its own viewer, and nothing about reading a teaching PDF needs custom chrome; it is the boring choice and it ships over the air. Audio cannot take that path, because a browser sheet gives no controls, no progress and no styling, and "play free audio in the app" would be a stretch. `expo-audio` is the current supported library for Expo SDK 54 and is what Radio core needs anyway, so the native build cost is paid once for two features rather than twice. Because that cost lands only in slice 6, the rest of Library still ships over the air, so the APK is a step inside one slice rather than a gate on the whole feature.

Two smaller calls are worth recording because they are the kind that quietly go the other way. The file size and type limit is checked by reading the object's metadata back from R2 rather than by trusting the `fileSizeBytes` the client sends, because a limit a client reports on itself is a form hint and not a limit; the cost is one extra metadata read per upload. And the signed file URL comes from a one shot action rather than from the item query, because a Convex query is a live subscription that reruns whenever the item changes, which would hand a new URL to a player mid track; the cost is a second round trip when the member taps.

Client side search is chosen against the instinct to build the index. At a few hundred items the whole visible catalogue is a small payload, search feels instant with no round trip, and the repo has neither a search index nor Convex pagination anywhere yet, so the index would be a new pattern introduced for a dataset that does not need it. The honest tradeoff is that this does not scale, and the Consequences say where the ceiling is and what replaces it.
