# Shared config (`packages/config`)

## Overview

`@klt-cyber/config` holds only `tsconfig.base.json`, the base TypeScript settings. Today only `packages/shared` extends it; the apps and `convex/` keep their own tsconfig. It has no runtime code and no scripts.

## Conventions

- Changing a compiler option here affects every workspace that extends it; run `pnpm test` from the root afterwards.

_Drafted by /audit from the repo, worth a quick human pass. Edit freely: once a line stops matching this draft, later runs treat it as curated and will flag rather than overwrite it._
