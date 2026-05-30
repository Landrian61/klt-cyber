// Graceful name/initials derivation. Email/password sign-ups may never set a
// name, so every consumer degrades to the email prefix and finally a neutral
// fallback rather than rendering "undefined" or crashing (PR 9, Step 7).

type NameSource =
  | { firstName?: string | null; lastName?: string | null; email?: string | null }
  | null
  | undefined;

function emailPrefix(email?: string | null): string {
  return email ? email.split('@')[0] : '';
}

/** Full display name: "First Last" → email prefix → "". */
export function getDisplayName(u: NameSource): string {
  if (!u) return '';
  const full = [u.firstName, u.lastName].filter(Boolean).join(' ').trim();
  return full || emailPrefix(u.email);
}

/** First-name greeting target: first name → email prefix → "". */
export function getGreetingName(u: NameSource): string {
  if (!u) return '';
  return (u.firstName ?? '').trim() || emailPrefix(u.email);
}

/** Up-to-2-letter initials for avatars: name initials → email initial → "U". */
export function getInitials(u: NameSource): string {
  if (!u) return 'U';
  const f = u.firstName?.trim()?.[0] ?? '';
  const l = u.lastName?.trim()?.[0] ?? '';
  const fromName = `${f}${l}`;
  if (fromName) return fromName.toUpperCase();
  const ep = emailPrefix(u.email);
  return ep ? ep[0].toUpperCase() : 'U';
}
