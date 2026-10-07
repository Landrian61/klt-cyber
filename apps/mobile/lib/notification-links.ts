import type { Href } from 'expo-router';

/**
 * The in-app route for a notification's `deepLink`, or `null` for a type
 * with no drill-down screen (yet) — tapping those just marks it read (or,
 * for an OS-tap, just opens the app to Home).
 *
 * Single source of truth for both the in-app notification list
 * (apps/mobile/app/notifications.tsx) and the OS-notification-tap listener
 * (apps/mobile/app/_layout.tsx) — every `dispatch` call site's `deepLink.type`
 * string (convex/notifications.ts) must have a case here or it silently falls
 * through to Home. Currently: "announcement", "event", "program", "profile"
 * are routed; "profile_review" and "role_assignment" are admin-portal-only
 * concerns with no mobile screen and are expected to fall through.
 */
export function resolveDeepLinkHref(deepLink: { type: string; id: string }): Href | null {
  switch (deepLink.type) {
    case 'announcement':
      return `/announcement-detail?id=${deepLink.id}` as Href;
    case 'event':
      return `/event-detail?id=${deepLink.id}` as Href;
    case 'program':
      return `/program-detail?id=${deepLink.id}` as Href;
    case 'profile':
      // Always the caller's own profile — the screen takes no id param, so
      // `deepLink.id` (the affected user's id, for role-appointment/
      // verification notifications) is carried for completeness but unused.
      return '/profile' as Href;
    default:
      // No mobile screen owns this type yet (role assignments, pending
      // profile reviews — both admin-portal concerns). Home is a safe,
      // always-valid landing spot rather than doing nothing on tap.
      return null;
  }
}
