# 0005. Devotionals and past events: Rationale

## Context

The KLT Cyber Church app needs two lightweight content features that the SRS places under the Media department's authority (§4.9): daily devotionals and a past events archive. Both are "write once, read many" content types with no complex state machines, no external API integrations, and no regulated data.

PR #57 (merged to `main`) already built the admin UI for both features: a devotionals management page with a 14 day planner, a past events archive page with a YouTube thumbnail grid, shared Zod validators in `packages/shared`, and a date key utility library. However, this code runs entirely on a localStorage backed mock data layer (`mediaContentData.tsx` with a `NEXT_PUBLIC_MEDIA_MOCK` env var toggle) and has no Convex backend. The pages were placed under `/admin/` (Church Administration's route group), but the SRS assigns authorship to Media (§4.9.2: Media HOD, delegate, and roster member all have access).

Three gaps need closing: (1) a Convex backend with real persistence, validation, and authorization, (2) the pages must move to a Media portal (the SRS's assignment, and the foundation for the five other Media pages: Radio, Radio inbox, Radio Insights, Super T, Recordings), and (3) the mobile app needs a Home devotional card (M2-03) and a past events browsing surface (M4-05).

The Media portal does not exist yet. No `/media/` route group, no Media specific authorization helpers, and no `media_admin` role type (the project uses department scoped `hod`/`department_admin` roles instead of adding per department role types). This feature stands up the portal shell and becomes the template for every other department portal the SRS defines.

## Options considered

### Option 1: Backend only, keep pages under /admin/

Add the Convex tables and mutations, wire the existing admin pages to real data, but leave them under `/admin/` where Naomi placed them. Defer the Media portal and mobile screens.

**Pros**:
- Smallest scope; the admin UI barely changes (just swap mock hooks for real ones)
- No new route group, layout, or sidebar to build

**Cons**:
- Violates the SRS's permission model: Church Administration HOD/delegate would author devotionals, not Media
- Every later Media feature (Radio, Recordings) would face the same "no portal" problem and either live in the wrong place or require the portal to be built then
- Mobile features remain unbuilt; devotionals are invisible to the congregation

### Option 2: Full end to end with Media portal (chosen)

Build the Convex backend, stand up a `/media/` route group with its own layout and role guard, move the pages from `/admin/` to `/media/`, rewire from mock to real data, and build both mobile surfaces.

**Pros**:
- SRS correct: Media owns its own content, using the same department scoped role pattern as Administration
- The portal shell is reusable: Radio, Recordings, and every other Media page slots into the same layout
- The feature ships end to end (Tracer Bullet): the congregation sees devotionals and past events from day one
- The existing admin UI (PR #57) is reused almost entirely; only the data layer and route location change

**Cons**:
- Larger scope than Option 1 (portal shell + mobile screens)
- Roster member access (F3-19) is deferred to feature #6, so the portal is temporarily narrower than the SRS intends

### Option 3: Build a generic department portal framework first

Design a reusable "department portal" abstraction that any department (Media, Pastoral, Finance) can instantiate, then build devotionals and past events on top of it.

**Pros**:
- Every future department portal benefits from the same abstraction
- Consistent patterns enforced by the framework

**Cons**:
- Premature abstraction: only Media's portal is being built right now, and each department's pages and permissions differ enough that a generic framework would either be too loose (no real constraints) or too rigid (wrong assumptions baked in)
- Delays shipping the actual feature while building infrastructure nobody needs yet
- The existing Administration portal was built without a framework and works fine; the same approach (copy the pattern, adapt to the department) is proven

## Rationale

Option 2 is the right call because it ships the feature end to end, respects the SRS's permission model, and creates a reusable portal shell without over engineering a framework. The Media department's authorization pattern is a direct mirror of the existing Administration pattern (`requireAdministrationAuthority` becomes `requireMediaAuthority`, both resolving a department by name and checking `hod`/`department_admin` scoped to it), so the implementation cost is low and the pattern is proven.

Option 1 was rejected because placing Media content under Church Administration's authority is a permission model violation that compounds: every Media feature would inherit the wrong gate, and fixing it later means moving pages and rewriting authorization checks under production traffic. Better to set up the portal now when the stakes are low (two pages, no production users yet).

Option 3 was rejected because generic frameworks for things you have one instance of are a known failure pattern. The Administration portal works, and its pattern (route group, layout with a role check, a sidebar component, and department scoped authz helpers) is simple enough to copy and adapt. If a third department portal reveals a genuine shared abstraction, that is the time to extract it.

The choice to defer roster member access (F3-19) to feature #6 is deliberate: roster based portal access is a permission model decision that affects all departments, not just Media, and it belongs in the department scoped permissions spec rather than being solved ad hoc here. The practical impact is small (most churches have one or two people writing devotionals; they can be granted `department_admin` in the meantime).
