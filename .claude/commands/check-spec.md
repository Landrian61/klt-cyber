Review an implementation against the KLT Cyber Church design system.

Instructions:
1. Load the design skill for the surface under review — `klt-cyber-brand` (mobile) or `klt-cyber-web-ui` (web admin) — and read `docs/INTERFACE_SPEC.md`.
2. Review the screen or component specified: $ARGUMENTS
3. Check for:
   - **Tokens** — no hardcoded hex, no raw Tailwind palette colours (`bg-amber-100`, `text-blue-700`), no scoped token override blocks in `globals.css`
   - **No-Line Rule** — no 1px solid borders used as structure; depth via tonal surface steps + ambient shadow, or a `Separator` where a real divider is meant
   - **Warm parchment** — no cold white/grey page backgrounds; `#FFFFFF` only for lifted cards; no pure-black text
   - **Typography by role** — display face only for headings ≥18px, body face for all UI text, mono face for every numeral
   - **Component reuse** — nothing hand-rolled that duplicates `components/ui/` or `components/shadcn/`
   - **States** — loading (`Skeleton`), empty (`EmptyState`), error, disabled, focus-visible all handled
   - **Motion** — purposeful rather than decorative; bails out on `prefers-reduced-motion`; cleans up on unmount; admin motion short (~300–500ms) and small (~8–12px)
   - **Interaction split** — destructive actions confirm in a `Dialog`, additive actions open a `Sheet`
   - **Accessibility** — keyboard reachable, accessible names, focus ring not suppressed
4. Report each deviation with its file path and line, then fix them.
