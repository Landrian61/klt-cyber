# Shared contracts (`packages/shared`)

## Overview

`@klt-cyber/shared` is the contract layer: enums, Zod schemas, and pure business logic used by mobile, admin, and Convex. It ships raw TypeScript (`main` points at `src/index.ts`), with no build step.

## Stack

- TypeScript, Zod 4, Vitest

## Key files

| File | Owns |
|---|---|
| `src/index.ts` | Public exports; add every new enum or schema here |
| `src/enums/` | Role types, user lifecycle, departments, weekly programs |
| `src/schemas/` | Zod validators (auth, profile, roles) |
| `src/schemas/__tests__/` | Vitest tests, one file per schema |

## Commands

```bash
pnpm --filter @klt-cyber/shared test                      # all tests
pnpm --filter @klt-cyber/shared test -- roles.test.ts     # one file
```

## Conventions

- Every new schema gets a test in `src/schemas/__tests__/`.
- Keep it runtime agnostic: no React, React Native, Node, or Convex imports, since all three consumers load it.
- When you change an export, update every consumer in the same change.

_Drafted by /audit from the repo, worth a quick human pass. Edit freely: once a line stops matching this draft, later runs treat it as curated and will flag rather than overwrite it._
