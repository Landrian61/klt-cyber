# Rationale: error screens, Sentry, update channels

## Context

`docs/scope/scope.md` row 3 bundles three things under one feature title
because they ship in the same Week 1 slot and share one goal, "make failure
visible and recoverable instead of a blank screen or crash, and get eyes on
production errors before ministers report them" (the row's own intent line).
They are not, however, one decision: error screens is a new UI pattern with
zero prior art in the repo; Sentry is a new third party integration with a
real platform constraint (Convex's runtime) to design around; update
channels turned out, on inspection at the start of this design conversation,
to already be built while finishing feature 2 days earlier. Treating three
differently shaped problems as one spec would have forced one `## Options
considered`/`## Rationale` to carry reasoning that doesn't actually share
forces.

## Options considered

### Option 1: One combined spec

Write Requirements, Options considered, Decision, and a single Feature
design covering all three pieces in one file.

**Pros**:
- One file to read, matches the one scope row exactly.

**Cons**:
- Mixes a genuine design decision (error screens), a genuine design decision
  with a real technical constraint (Sentry), and documentation of shipped
  work (update channels) into one `## Options considered` that doesn't apply
  to the third piece at all. The combined Build plan would also hide the one
  real cross dependency (error screens needs Sentry's boundary already
  initialized) inside a much larger, harder to scan task list.

### Option 2: Three unrelated top level specs (0002, 0003, 0004)

Give each piece its own numbered spec with no structural relationship.

**Pros**:
- Each spec fully independent and scannable on its own.

**Cons**:
- Loses the one thing that does couple them: the build order dependency
  between Sentry's SDK initialization and error screens' boundary wrap, and
  the shared choice of the same four reference screens for both. That
  coordination would live nowhere, or get duplicated into both specs and
  drift.

### Option 3: Umbrella with three child specs (chosen)

One directory (`0002-error-screens-sentry-update-channels/`), `index.md` as
the coordinating build spec, three self sufficient children.

**Pros**:
- Each child reads and builds as its own decision, with its own Options
  considered and Rationale, sized to what it actually needs (update channels
  needed almost none; Sentry needed a real options comparison).
- The one real cross child contract (build order, shared reference screens)
  lives in exactly one place, `index.md`, not duplicated or lost.

**Cons**:
- More files to navigate than Option 1; mitigated by `index.md`'s Structure
  table pointing straight to each.

## Rationale

The umbrella skill convention exists for exactly this shape: "related sub
decisions" that ship together but reason independently. Option 1 would have
produced a spec `/develop` has to read in full to find the few lines that
actually apply to whichever piece it's building next; Option 2 would have
silently dropped the build-order dependency the moment someone built from
one child spec without having read the other. Option 3 keeps each decision's
reasoning scoped to what it actually needs while keeping the one piece of
real coordination in the one file that governs build order for the whole
feature.

## References

**Project sources** (verifiable, in this repo):
- `AGENTS.md` — stack and design system conventions (Kingdom Radiant, the
  two Convex projects, the per-environment config pattern)
- `spec/DEPLOYMENT.md` §3.3 — the Cloudflare Build vs. Runtime variable
  distinction, reused for `NEXT_PUBLIC_SENTRY_DSN`
- `docs/scope/scope.md` row 3 — the feature's intent and acceptance
  criteria seeds (F5-06, F5-07, F5-08, M1-04, NF-06, NF-13, NF-14)
- `.github/workflows/deploy-staging.yml`, `deploy-prod.yml` — the existing
  CI pattern this feature's config and release tagging reuse

**Practices & standards**:
- Error boundaries as the standard React mechanism for catching render time
  failures (0002-error-screens.md)
- Sentry envelope format as the wire protocol its own SDKs use for sending
  events (0002-sentry-observability.md)

**Links** (web verified during this conversation's research):
- Convex Exception Reporting (official Sentry integration, Pro-plan only): https://docs.convex.dev/production/integrations/exception-reporting
- Convex × Sentry overview: https://convex.dev/can-do/sentry
- Convex changelog, improved Sentry tags: https://ship.convex.dev/changelog/vol-1-improved-sentry-tags
- Convex Log Streams (a different feature, not a Sentry path): https://docs.convex.dev/production/integrations/log-streams/
- Sentry JavaScript custom transports (the envelope POST shape): https://docs.sentry.io/platforms/javascript/configuration/transports/
- Supabase Edge Functions + Sentry (analogous isolate-constrained precedent, not Convex specific): https://supabase.com/docs/guides/functions/examples/sentry-monitoring
