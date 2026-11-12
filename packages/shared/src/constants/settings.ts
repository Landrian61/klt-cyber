/**
 * My Profile and Settings (spec 0023): the support contact, the WhatsApp help
 * link, and the user facing copy the profile, edit and settings screens show.
 */

/**
 * Who answers Help & Support (F5-11, M6-07). `whatsapp` is E.164 (`+256...`)
 * and stays empty until the real number is filled in before the pilot; the
 * Help screen says help isn't set up while it is empty (AC-24). Changing it
 * needs an OTA update.
 */
export const SUPPORT_CONTACT: { name: string; whatsapp: string } = {
  name: 'Andrew',
  whatsapp: '',
};

export type SupportPlatform = 'android' | 'ios' | 'web' | 'windows' | 'macos';

/**
 * The prefilled help message (AC-23). Only the app version and the platform go
 * in: never a name, an email or any profile state.
 */
export function buildSupportMessage(details: {
  version?: string | null;
  platform: SupportPlatform | string;
}): string {
  const platform =
    details.platform === 'ios' ? 'iOS' : details.platform === 'android' ? 'Android' : null;
  const parts = [details.version ? `v${details.version}` : null, platform].filter(
    (part): part is string => !!part
  );
  const suffix = parts.length > 0 ? ` (${parts.join(', ')})` : '';
  return `Hi, I need help with the KLT app${suffix}.`;
}

/**
 * The `wa.me` link the Help button opens, or null when no number is set
 * (AC-23, AC-24).
 */
export function buildSupportWhatsAppUrl(
  contact: { whatsapp: string },
  details: { version?: string | null; platform: SupportPlatform | string }
): string | null {
  const digits = contact.whatsapp.replace(/\D/g, '');
  if (!digits) return null;
  return `https://wa.me/${digits}?text=${encodeURIComponent(buildSupportMessage(details))}`;
}

/** The short bio cap on the edit screen (AC-9); the wizard sets none. */
export const PROFILE_SHORT_BIO_MAX = 280;

export const SETTINGS_COPY = {
  groups: {
    privacy: 'Privacy',
    notifications: 'Notifications',
    account: 'Account',
    help: 'Help',
  },
  directory: {
    title: 'Let other members find me',
    body:
      'Your name, photo and areas of service show in the church directory. Your phone number, address and family details never do.',
  },
  notifications: {
    rowTitle: 'Notifications',
    rowBody: 'Push permission and the radio programs you follow.',
    radioTitle: 'Followed radio programs',
    radioBody: 'Get a push when a program you follow goes live.',
  },
  account: {
    changePassword: 'Change password',
    changePasswordBody: 'Signs out your other devices once it changes.',
    providerOnly: 'You sign in with Google or another provider',
    signOut: 'Sign out',
    deleteAccount: 'Delete account',
    deleteAccountBody: 'Permanently remove your account and personal data.',
  },
  help: {
    rowTitle: 'Help & Support',
    rowBody: 'Message us on WhatsApp.',
    title: 'Help & Support',
    who: (name: string) =>
      `${name} looks after the KLT app. Send a WhatsApp message and ${name} will get back to you.`,
    button: 'Message on WhatsApp',
    notSetUp: "Help isn't set up in this build yet",
  },
  portal: {
    title: 'You have work on the web portal',
    because: 'Because you serve as',
    button: 'Open web portal',
  },
  churchLife: {
    title: 'MY CHURCH LIFE',
    roles: 'Roles',
  },
  mentorship: {
    completedNeedsConfirmation: 'Administration confirms this step',
    completedLocked: 'Administration changes this',
  },
  edit: {
    saved: 'Profile updated',
    discardTitle: 'Discard changes?',
    discardBody: "Your changes haven't been saved.",
    discard: 'Discard',
    keepEditing: 'Keep editing',
    genericError: "Couldn't save, check your connection and try again",
    uploading: 'Wait for the photo to finish uploading',
  },
  password: {
    title: 'Change password',
    current: 'Current password',
    next: 'New password',
    confirm: 'Confirm new password',
    tooShort: 'Use at least 8 characters',
    mismatch: "The new passwords don't match",
    wrongCurrent: "That isn't your current password",
    generic: "Couldn't change your password, check your connection and try again",
    success: 'Password changed. Your other devices have been signed out.',
    submit: 'Change password',
  },
} as const;
