Create a new reusable component for the KLT Cyber Church app.

Instructions:
1. Determine the target surface: **mobile** (`apps/mobile/components/`) or **web admin** (`apps/admin/components/`).
2. Load the matching design skill first — `klt-cyber-brand` for mobile, `klt-cyber-web-ui` for web admin. Check `docs/INTERFACE_SPEC.md` for any spec covering: $ARGUMENTS
3. **Check whether it already exists before building it.** On web, look in `components/ui/` and `components/shadcn/`; a hand-rolled modal, dropdown, table, or empty state duplicating a shadcn primitive is a defect. If a suitable shadcn component isn't installed, add it with `npx shadcn@latest add <name> -c apps/admin` rather than writing one.
4. Use TypeScript with an exported props interface, a functional component, and a named export.
5. Apply the design tokens — no hardcoded colours, no raw Tailwind palette values. Warm parchment surfaces, No-Line Rule (depth via tonal shifts + ambient shadow, not borders), display face only ≥18px, numerals in mono.
6. Implement every relevant state: default, hover/pressed, focus-visible, disabled, loading (`Skeleton` on web), and empty (`EmptyState` on web).
7. Animations: web uses the `components/motion/` primitives or raw anime.js following the house pattern; mobile uses Reanimated. Always respect `prefers-reduced-motion` and clean up on unmount.
8. Accessibility: keyboard-reachable, accessible name on every interactive element, ≥44×44px touch targets on mobile.
