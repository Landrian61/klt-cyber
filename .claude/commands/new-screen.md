Create a new screen following the KLT Cyber Church design system.

Instructions:
1. Determine the target surface from the request: **mobile** (`apps/mobile/app/**`, Expo Router) or **web admin** (`apps/admin/app/**`, Next.js App Router).
2. Load the matching design skill first — `klt-cyber-brand` for mobile, `klt-cyber-web-ui` for web admin. Consult `docs/INTERFACE_SPEC.md` for any screen-specific spec: $ARGUMENTS
3. Create the screen in the correct location for that surface's routing convention.
4. Reuse existing components before writing new markup:
   - Mobile: `apps/mobile/components/` (+ `components/ui/` primitives)
   - Web: `apps/admin/components/ui/` (DataTable, EmptyState, Pagination, SearchInput, FilterBar, StatCard, Heading), then `components/shadcn/`, then `components/motion/`
5. Apply the design tokens — never hardcode colours or hex values. Warm parchment base, No-Line Rule (no 1px structural borders — use tonal shifts), display face only for headings ≥18px, numerals in the mono face.
6. On web: server components own data + authorization, `"use client"` only where interaction requires it; filter/sort/page state belongs in the URL.
7. Add motion only where it makes a state change legible — `Reveal`/`CountUp` on web, Reanimated on mobile. Always bail out on `prefers-reduced-motion`.
8. Extract anything reusable into the surface's shared components directory rather than leaving it inline.
