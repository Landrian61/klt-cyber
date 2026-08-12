Set up or update the theme/token system from `docs/INTERFACE_SPEC.md`.

Instructions:
1. Read `docs/INTERFACE_SPEC.md` §1 (Design System) completely.
2. Update the token source for the target surface:
   - **Mobile** — `apps/mobile/constants/theme.ts` (fully typed TS: colours, typography scale, spacing, radius, shadows/elevation)
   - **Web admin** — the `@theme` block at the top of `apps/admin/app/globals.css` (Tailwind v4 is CSS-first; tokens there generate the utilities)
3. Keep both surfaces in sync — they share one palette and one set of typographic roles. A token added to one usually belongs in the other; flag any deliberate divergence.
4. Include the semantic tokens (success, error, warning, plus live/unread on mobile) alongside the core palette.
5. Never add a scoped override block that redefines core tokens for one section — one token set, one look, across every surface and portal.
6. Values must match `docs/INTERFACE_SPEC.md` exactly. If the spec and the code disagree, surface the conflict rather than silently picking one.
