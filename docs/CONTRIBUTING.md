# Contributing to KLT Cyber Church

> The practical guide for team members. If you're new, work through §1–§4 in
> order and you'll be set up and shipping your first PR. Sections after that
> are reference material for specific situations you'll hit later.

---

## 1. Before you start

Read these first, in this order:

1. [`docs/VISION.md`](./VISION.md) — what we're building, what we're not, and why
2. [`docs/ARCHITECTURE.md`](./ARCHITECTURE.md) — how the system is put together
3. [`docs/ROLES.md`](./ROLES.md) — the RBAC model
4. [`docs/DATA_MODEL.md`](./DATA_MODEL.md) — the schema and its evolution
5. Skim [`docs/INTERFACE_SPEC.md`](./INTERFACE_SPEC.md) — the design language

Then ask the tech lead for access:

- **GitHub** — write access to this repository
- **Convex** — invited to the KLT Cyber Convex project (you'll create your own
  dev deployment, but you need org access to reach staging/prod dashboards)
- **Expo / EAS** — added to the KLT Cyber Expo team (only needed if you'll
  touch mobile builds)
- **Cloudflare** — optional, only if you need Pages dashboard access

You will not commit until §1 through §4 are complete.

---

## 2. Prerequisites

Software you need installed locally.

| Tool | Version | Notes |
|------|---------|-------|
| Node.js | 20+ | Use `nvm` or `fnm` if you juggle Node versions across projects |
| pnpm | 9.15+ | Install via `corepack enable && corepack prepare pnpm@latest --activate`. On Windows, if Corepack hits a Program Files permission error, use the standalone installer at [`get.pnpm.io`](https://get.pnpm.io) |
| Git | Recent | Configure `user.name` and `user.email` — commits are Conventional-Commits linted and your email appears in history |
| VS Code (recommended) | Recent | With extensions: ESLint, Prettier, Tailwind CSS IntelliSense, TypeScript Nightly |
| Expo Go or a dev build | Current | Only if you'll work on mobile. iOS simulator or Android emulator also works |

**Windows note.** If you're on Windows, avoid keeping the repo under a
OneDrive-synced folder (e.g. Desktop). OneDrive's file locks cause
intermittent "Permission denied" errors on `git mv`, `pnpm install`, and
Metro's file watcher. A path like `C:\Dev\klt-cyber` is fine.

---

## 3. Getting the project running locally

### 3.1 Clone and install

```bash
git clone <repo-url> klt-cyber
cd klt-cyber
pnpm install
```

`pnpm install` walks the workspace and installs dependencies for the root,
both apps, and both packages. First run takes a couple of minutes.

### 3.2 Set up your own Convex dev deployment

Each developer runs their own Convex dev deployment locally. This keeps
schema experiments and stray mutations from colliding across the team.

```bash
pnpm exec convex dev
```

The first time you run this, Convex will:

- Prompt you to log in (via browser).
- Ask you to configure a project — choose "connect to an existing project"
  and select **KLT Cyber**.
- Create a dev deployment under your account.
- Write `CONVEX_DEPLOYMENT` and `CONVEX_URL` into `convex/.env.local`.

Leave `pnpm exec convex dev` running in one terminal. It pushes your schema
changes automatically as you edit files under `convex/`.

### 3.3 Configure environment variables

Three files, one per component. Convex writes the first one for you; you
create the other two.

**`convex/.env.local`** (mostly auto-written by `convex dev`, plus these):

```bash
BETTER_AUTH_SECRET=<run: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))">
SITE_URL=http://localhost:3000
SEED_ADMIN_EMAIL=<your-email>
# GOOGLE_CLIENT_ID=       # optional in dev — email/password works without it
# GOOGLE_CLIENT_SECRET=   # same
```

Then push these to Convex:

```bash
pnpm exec convex env set BETTER_AUTH_SECRET "<the-value>"
pnpm exec convex env set SITE_URL "http://localhost:3000"
pnpm exec convex env set SEED_ADMIN_EMAIL "<your-email>"
```

**`apps/admin/.env.local`:**

```bash
NEXT_PUBLIC_CONVEX_URL=<from convex/.env.local — the CONVEX_URL value>
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

**`apps/mobile/.env.local`:**

```bash
EXPO_PUBLIC_CONVEX_URL=<same as above>
```

None of these `.env.local` files should ever be committed. The root
`.gitignore` excludes them; verify with `git status` before pushing.

### 3.4 Run each app

Three terminals, one command each:

```bash
# Terminal 1 — Convex (keep running)
pnpm exec convex dev

# Terminal 2 — Web admin
pnpm admin

# Terminal 3 — Mobile
pnpm mobile
```

The web admin runs at `http://localhost:3000`. The mobile app opens Expo's
CLI — press `i` for iOS simulator, `a` for Android emulator, or scan the QR
code with Expo Go on a physical device.

### 3.5 Bootstrap yourself as system admin

Once the project is running, sign up in the web admin with your
`SEED_ADMIN_EMAIL`. Then run:

```bash
pnpm exec convex run seed:bootstrapSystemAdmin
```

This creates your `system_admin` role assignment. Sign out and back in —
you'll now land on the role picker with "System Administrator" available.

---

## 4. Contribution workflow

The end-to-end flow, from picking up work to seeing it in staging.

### 4.1 Sync with `main`

```bash
git checkout main
git pull --rebase
```

### 4.2 Create your branch

Branch naming — kebab-case, prefixed by the kind of change:

- `feature/short-description` — new functionality
- `fix/short-description` — bug fixes
- `chore/short-description` — dependency upgrades, tooling, cleanup
- `docs/short-description` — documentation-only changes
- `refactor/short-description` — code restructuring without behavior change
- `hotfix/short-description` — urgent fix branched from `prod` (see §4.8)

Examples:

```bash
git checkout -b feature/profile-completion-flow
git checkout -b fix/sign-out-redirect
git checkout -b chore/upgrade-expo-sdk-55
```

### 4.3 Work locally

Do your work. Test in your local environment. When you touch schema, update
`docs/DATA_MODEL.md` in the same commit. When you add a role type, update
`docs/ROLES.md`. See §7 for the full "what to update where" table.

### 4.4 Commit with Conventional Commits

Every commit message follows [Conventional Commits](https://www.conventionalcommits.org).
The commit-msg hook (via husky) enforces the format locally — bad commits
are rejected before they leave your machine.

Format:

```
<type>(<scope>): <subject>

[optional body]

[optional footer]
```

**Types.** `feat`, `fix`, `chore`, `docs`, `refactor`, `test`, `ci`,
`build`, `style`.

**Scope** (optional but recommended). `mobile`, `admin`, `convex`, `shared`,
`config`, `docs`, or the specific area (e.g. `auth`, `radio`, `clans`).

Examples:

```
feat(mobile): profile completion flow

fix(admin): correct redirect after sign-in with pending role

chore: upgrade pnpm to 9.15

docs(vision): capture Radio Admin MVP subset decisions
```

**Subject rules.** Lowercase after the colon; imperative mood ("add feature",
not "added feature" or "adds feature"); no period at the end; under 72
characters.

If your work spans multiple concerns, make multiple commits. If your commit
message needs a paragraph of explanation, put it in the body — the subject
should still be crisp.

### 4.5 Push and open a pull request

```bash
git push -u origin feature/profile-completion-flow
```

Open a PR against `main` on GitHub. Fill in the description completely —
see §6 for the template.

### 4.6 CI runs

On every push to a PR branch, CI runs:

- Type-checking across all packages
- Lint (ESLint + Prettier)
- Any tests wired for the touched package

PRs cannot merge with red CI. If CI fails, fix and push again — the PR
updates automatically.

### 4.7 Review

The tech lead reviews every PR in the current phase. Peer review is
introduced when the team has demonstrated familiarity with the codebase
(exact criteria decided when we get there).

If review requests changes: address them in additional commits on the same
branch, then push. Do not amend and force-push during review — it makes
review comments hard to follow. Squash-vs-preserve happens automatically at
merge time (rebase-and-merge; see §4.9).

If review approves: the tech lead merges.

### 4.8 Merging

Merges use **rebase-and-merge**. This keeps `main` history linear — no merge
commits. Your feature branch's commits become sequential commits on `main`.

Rebase-and-merge means your local branch will not be automatically kept in
sync with `main` while your PR is open. If `main` moves while your PR is
under review and conflicts arise, rebase your branch:

```bash
git checkout feature/your-branch
git fetch origin
git rebase origin/main
# resolve conflicts, then:
git push --force-with-lease
```

`--force-with-lease` (not `--force`) protects against overwriting anyone
else's work on the branch — always prefer it.

After merge, your branch is deleted from the remote. You can delete your
local copy with `git branch -D feature/your-branch`.

### 4.9 Staging → production

`main` auto-deploys to staging. Production deploys are deliberate, from a
`main` → `prod` PR opened by the tech lead. Individual contributors do not
push to `prod` directly.

### 4.10 Hotfixes

Emergency fixes to production:

```bash
git checkout prod
git pull --rebase
git checkout -b hotfix/short-description
# fix, commit, push
```

Open the PR against `prod`. Once merged (still requires tech lead review),
merge `prod` back into `main` to keep them in sync:

```bash
git checkout main
git pull --rebase
git merge prod
git push
```

Or cherry-pick the fix commit into `main` if the two branches have diverged
significantly. Ask the tech lead if unsure.

---

## 5. Pull request conventions

### 5.1 Title

Same format as your primary commit message.

```
feat(mobile): profile completion flow
```

### 5.2 Description template

Use this shape. Skip sections that don't apply.

```markdown
## What
Brief summary of what this PR does — one or two sentences.

## Why
The reasoning. What problem is this solving? What decision does it reflect?

## How
Notable implementation choices, especially non-obvious ones. Anything a
reviewer might otherwise question — pre-empt it here.

## Testing
What you verified. Manual test steps, unit tests added, or "smoke tested
against staging."

## Docs updated
- [ ] DATA_MODEL.md (if schema changed)
- [ ] ROLES.md (if new role type or scope)
- [ ] ARCHITECTURE.md (if new technology or major structural change)
- [ ] VISION.md (if scope changed — usually requires discussion first)
- [ ] Other: <list>

## Related
Any related PRs, issues, or discussions.
```

### 5.3 Scope

Small PRs get reviewed faster. If your PR touches more than a few files
across unrelated concerns, consider splitting. Target: reviewable in 30
minutes or less.

Exceptions exist — schema changes usually touch several files atomically
and that's fine. Use judgment.

---

## 6. Review expectations

What the tech lead looks for when reviewing your PR:

**Alignment with the docs.** Does the change fit VISION.md's scope? Does
data schema in the PR match DATA_MODEL.md? If not, was the doc updated in
the same PR?

**Correctness of the pattern.** Does the code follow existing patterns —
the design system, the RBAC enforcement layers, the shared package
convention, the approval-state shape? Reinventing patterns costs future
consistency.

**Scope discipline.** Is the PR focused? Does it try to do too much? Are
there sneaked-in refactors or unrelated changes?

**Data safety.** Any schema change deployed correctly? Migration steps
documented? Reversible if wrong?

**Not present but expected.** Are docs updated? Are ROLES.md entries added
for new role types? Is the shared package the source of truth for new
enums or validators?

**Reviewer humility.** Reviewers assume good faith. Questions are questions,
not accusations. If a reviewer misreads the code, that's a signal the code
might need clarification for the next reader too.

---

## 7. What to update where

A quick reference for which document owns which decision.

| You changed... | Update this |
|----------------|-------------|
| A Convex table, index, or field | `docs/DATA_MODEL.md` (in the same PR) |
| A new role type or its scope | `docs/ROLES.md` |
| An enum or Zod schema used across apps | `packages/shared` (source of truth) |
| A new third-party service or major tech choice | `docs/ARCHITECTURE.md` |
| An MVP feature scope decision | `docs/VISION.md` (usually needs discussion first) |
| The contribution workflow itself | This document |
| The visual design system | `docs/INTERFACE_SPEC.md` |
| Deployment mechanics | `docs/DEPLOYMENT.md` (created when the pipeline lands) |

If you're unsure, mention it in the PR description and the reviewer will
confirm.

---

## 8. Working with the codebase

### 8.1 The shared package is authoritative

Any type or Zod schema used in more than one place lives in
`packages/shared`. Mobile, admin, and Convex all import from it. Do not
duplicate enums or validators across apps — that's a bug waiting to
happen.

When you change something in `packages/shared`, you must update all
consumers in the same PR. TypeScript will usually tell you where.

### 8.2 Schema changes go through the doc first

When adding or modifying a Convex table:

1. Discuss the change (in a PR draft, issue, or with the tech lead).
2. Update `docs/DATA_MODEL.md` first — including field-by-field justification.
3. Update `convex/schema.ts`.
4. Update `packages/shared` if the shape is used cross-app.
5. Let `pnpm exec convex dev` push the change and regenerate types.
6. Update consuming code.
7. Verify locally end-to-end.
8. Open the PR.

If the change touches production-relevant validators (tightening a union,
removing a field), coordinate with the tech lead on migration order —
Convex will reject a schema deploy if existing data violates the new shape.

### 8.3 Adding a new role type

See `docs/ROLES.md` §8 for the checklist. In brief: update the shared enum,
Convex schema union, the assign-role mutation, `docs/ROLES.md`, and
`docs/DATA_MODEL.md`.

### 8.4 Testing policy

For MVP, testing is not a priority. That said:

- **Shared package validators.** When you add a Zod schema to `packages/shared`,
  add basic unit tests (Vitest). This is the one place tests are strongly
  encouraged — they take minutes to write and catch a lot.
- **Convex mutations with business logic.** Convex provides test helpers.
  Use them when the logic is non-trivial. Judgment call.
- **UI tests.** Deferred entirely for MVP.

If a bug is caught in production, adding a regression test that reproduces
it is expected as part of the fix.

### 8.5 The Sacred Curator design language

`docs/INTERFACE_SPEC.md` governs visual design. When building new UI,
extend existing primitives rather than introducing new ones. If a new
primitive is needed, name it, justify it, and add it to the component
library — do not create one-off styled elements inline.

No 1-pixel borders. Depth through tonal surface shifts. Warm parchment
background. Gold gradients for primary CTAs. Read the spec for the full
philosophy.

---

## 9. Environment and secrets

**Nothing sensitive is ever committed.** This includes:

- Any file matching `.env*`
- API keys, deploy tokens, OAuth secrets, database URLs
- Personal identifiers, real user data, screenshots containing real data

Secrets live in:

- **Convex env vars** (`convex env set`) — per deployment (dev, staging, prod)
- **GitHub Actions secrets** — for CI/CD tokens
- **Cloudflare Pages env vars** — for web deployments
- **EAS build profile envs** — for mobile builds

If you accidentally commit a secret, rotate it immediately (in the source
service) and follow up with the tech lead. Do not just amend the commit —
git history preserves it.

---

## 10. Common issues

**"Metro can't resolve @klt-cyber/shared"** — try `pnpm --filter mobile
start --clear` to flush Metro's cache.

**"Convex deploy failed because data violates new schema"** — a schema
tightening is being deployed against a deployment that still holds
old-format data. Migrate first (a mutation that transforms the old data),
then deploy the tighter schema. In dev, sometimes it's easier to just delete
the offending rows via the Convex dashboard.

**"pnpm install is slow or fails"** — try `pnpm install --frozen-lockfile`
to match CI behavior. If lockfile issues persist, delete
`node_modules` at root and in `apps/mobile`, then reinstall.

**"Windows: git mv failed with Permission denied"** — either OneDrive has a
lock (pause sync), or a Node process is running that has a handle on the
folder. Kill any running dev servers and retry.

**"OAuth redirect loop on sign-in"** — usually a mismatch between
`SITE_URL` (in Convex env) and what your dev server is actually running at.
Verify both are `http://localhost:3000`.

**"Better Auth alpha API changed"** — Better Auth's Convex integration is
in alpha and its API shifts between versions. Version numbers are pinned in
`package.json` — do not auto-update. If an upgrade is needed, it's a
deliberate PR with end-to-end testing.

---

## 11. Getting unstuck

- **Stuck for 30 minutes on the same problem?** Ask. Don't spin. The tech
  lead's time saving you an hour is worth more than protecting your ego.
- **Not sure what a decision should be?** Propose it in a draft PR
  description and get input before implementing. Cheaper to change a plan
  than to change code.
- **Doc feels wrong?** Say so. These documents are living. If something
  contradicts reality, or reality contradicts something, one of them needs
  to update. Flag it — don't quietly ignore.
- **Something in the design doesn't feel right?** Push back. "This looks
  off" is a legitimate concern. Sacred Curator is a distinctive aesthetic;
  losing it costs the product.

Channels for reaching people are set up separately — the tech lead will
share them when you're onboarded.

---

## 12. Related documents

- [`docs/VISION.md`](./VISION.md) — MVP scope and guiding principles
- [`docs/ARCHITECTURE.md`](./ARCHITECTURE.md) — technical shape
- [`docs/ROLES.md`](./ROLES.md) — RBAC reference
- [`docs/DATA_MODEL.md`](./DATA_MODEL.md) — schema evolution
- [`docs/INTERFACE_SPEC.md`](./INTERFACE_SPEC.md) — Sacred Curator design
- `docs/DEPLOYMENT.md` — deployment runbook (created when the pipeline ships)

---

Welcome to the team.