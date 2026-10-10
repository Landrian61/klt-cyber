# 0002. Update channels (staging and production EAS Update channels)

## Summary

This documents something already built, not a new decision. Expo over the
air (OTA) updates (JavaScript bundle fixes shipped without an app store
review) already run on two separate channels, `staging` and `production`,
each bound to its own git branch and its own automated deploy. This
satisfies F5-08 and NF-14 as written. The one gap: neither channel has a
real native binary installed anywhere yet, so the OTA path is wired and
proven to publish, but not yet proven end to end against an actual installed
app.

## Context

F5-08/NF-14 call for OTA updates on separate staging and production
channels. Both channels, and the CI that publishes to them, were built and
proven while delivering feature 2 (staging and production environments),
days before this spec was written, as a direct consequence of giving mobile
its own separate staging and production backends. There is no remaining
design question: the channels exist, are bound correctly, and have each
published successfully at least once.

## Requirements

**Acceptance criteria** (already met, documented here for traceability):
- **AC-1**: A `staging` EAS Update channel exists, bound to the `staging`
  branch, and `deploy-staging.yml`'s `mobile-update` job publishes to it on
  every push to `main`. Met.
- **AC-2**: A `production` EAS Update channel exists, bound to the
  `production` branch, and `deploy-prod.yml`'s `mobile-update` job publishes
  to it on every push to `prod`. Met, first real run 2026-10-09 (PR #55),
  succeeded in 2m18s.
- **AC-3**: Each channel's publish re-inlines that environment's
  `EXPO_PUBLIC_CONVEX_URL`/`..._SITE_URL` at publish time, so a binary and
  its OTA updates can never silently point at different backends. Met.

## Options considered

Not applicable. This documents a decision already made and shipped during
feature 2's build, not a fresh evaluation. There was no real alternative to
separate channels: NF-16 already requires staging and production to be
fully separate environments, and EAS Update channels are the only mechanism
Expo offers for routing an OTA update to one audience and not another.

## Decision

**Chosen option**: separate `staging`/`production` EAS Update channels,
each bound to its own branch, each published by that branch's existing
deploy workflow. Already built; nothing for `/develop` to do here.

## Rationale

No fresh rationale to record: this spec exists to give F5-08/NF-14 a
traceable record of what was built and why, not to re-justify a decision
that was a direct, uncontested consequence of feature 2's environment
separation.

## Feature design

**Data model sketch**: Not applicable, no Convex data involved.

**State transitions**: Not applicable.

**API surface**: Not applicable, this is CI/EAS configuration, not an
application surface.

**Value sourcing**: Not applicable.

**Key invariants**: A binary and its OTA updates always point at the same
backend (enforced by re-inlining the `EXPO_PUBLIC_*` vars at publish time,
not trusting whatever the last binary build had baked in).

**Security model**: Not applicable.

**Configuration required**: Already in place — see `spec/DEPLOYMENT.md` §3.2,
§4.3, §4.4 for the exact variables and secrets.

**Critical test scenarios**: Already exercised in production, not merely
planned — see AC-2's real run above.

## Build plan

Nothing to build. If this were still open, the work would be: provision the
two channels, bind each to its branch, wire each deploy workflow's
`mobile-update` job to publish to its channel, re-inlining that
environment's Convex URLs. All of it already exists; see `spec/DEPLOYMENT.md`
§2 to §4.4 for the exact mechanics of what's live.

## Consequences

**Positive**:
- F5-08/NF-14 need no further work in this feature.
- The channel/branch/CI wiring this relies on is the same pattern the other
  two children (error screens, Sentry) reuse for their own per-environment
  configuration — a proven template, not a fresh one.

**Negative / tradeoffs**:
- The OTA pickup path (a real binary noticing and applying an update)
  remains unverified until a binary exists.

**Neutral**:
- `spec/DEPLOYMENT.md` stays the operational source of truth for exact
  mechanics; this spec only records the decision and points there.

## Follow-up

- [ ] When scope feature 21 (store readiness) builds the first real
  binaries, confirm both actually pick up an OTA update from their bound
  channel before calling update channels fully proven.
