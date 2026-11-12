/**
 * A one shot message handed from a screen that is closing to the screen it
 * returns to (spec 0023, AC-8: "Profile updated" after Save). In memory only:
 * the receiving screen takes it on focus, and it is gone after one read.
 */
let pending: string | null = null;

export function setFlashMessage(message: string): void {
  pending = message;
}

export function takeFlashMessage(): string | null {
  const message = pending;
  pending = null;
  return message;
}
