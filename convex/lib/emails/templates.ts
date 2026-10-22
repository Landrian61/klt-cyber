/**
 * The six system email bodies (spec 0007, SRS F1-10, extended by spec 0008).
 *
 * `TEMPLATES` is typed `Record<EmailTemplate, ...>`, so TypeScript itself
 * requires exactly the names the shared registry declares: an extra key fails
 * to compile, and a missing key fails to compile too. The length test in
 * `packages/shared` guards the registry; this type guards the renderers.
 *
 * Every template returns a subject plus both an HTML and a plain text body
 * (AC-20). None of them builds HTML by hand — they describe an `EmailBody` and
 * the layout escapes every interpolated value on the way in.
 */

import type { EmailTemplate } from "@klt-cyber/shared";
import {
  accountDeletionExpiryLabel,
  passwordResetExpiryLabel,
} from "@klt-cyber/shared";
import {
  CHURCH_NAME,
  type EmailBody,
  greeting,
  renderEmailHtml,
  renderEmailText,
} from "./layout";

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

function render(subject: string, body: EmailBody): RenderedEmail {
  return {
    subject,
    html: renderEmailHtml(body),
    text: renderEmailText(body),
  };
}

/**
 * Data each template reads. These cross a Convex function boundary as plain
 * values, so they are deliberately simple; the typed senders in
 * `convex/emails.ts` are what callers actually use.
 */
export interface WelcomeData {
  firstName?: string | null;
}
export interface PasswordResetData {
  firstName?: string | null;
  url: string;
}
export interface ProfileVerifiedData {
  firstName?: string | null;
}
export interface ProfileSentBackData {
  firstName?: string | null;
  reason: string;
}
export interface AccountDeletedData {
  firstName?: string | null;
}
/**
 * The deletion link carries no first name on purpose. It is sent from an
 * unauthenticated page to an address somebody typed, so greeting the recipient
 * by name would confirm to a stranger that the address belongs to a member.
 */
export interface AccountDeletionRequestedData {
  url: string;
}

// No link, per spec 0007's links decision: the next step happens in the app the
// person already has, and a welcome email with no call to action travels better
// through spam filters than one with a button.
function welcome(data: WelcomeData): RenderedEmail {
  return render(`Welcome to ${CHURCH_NAME}`, {
    heading: "Welcome to the family",
    paragraphs: [
      greeting(data.firstName),
      `We are glad you are here. Your ${CHURCH_NAME} account is ready, and you can explore the app right away.`,
      "When you are ready, complete your member profile in the app. It is how the Hospitality team gets to know you, places you in a clan, and connects you with the areas of service that fit you.",
      "No rush. Look around first if you would rather.",
    ],
  });
}

// Exactly one action button, whose link is the URL Better Auth built (AC-3).
function passwordReset(data: PasswordResetData): RenderedEmail {
  return render("Reset your KLT Cyber password", {
    heading: "Reset your password",
    paragraphs: [
      greeting(data.firstName),
      "Somebody asked to reset the password on this account. If that was you, use the button below to set a new one.",
      "If it was not you, you can ignore this email. Nothing changes until the link is used, and your current password still works.",
    ],
    action: { label: "Set a new password", url: data.url },
    footnote: `This link works once and expires in ${passwordResetExpiryLabel()}.`,
  });
}

// Says verified, and deliberately stops there: it does not call the person a
// member and does not mention mentorship, matching the wording of the existing
// push notice in `verifyProfile`. Carries no links (AC-13).
function profileVerified(data: ProfileVerifiedData): RenderedEmail {
  return render("Your profile has been verified", {
    heading: "Your profile has been verified",
    paragraphs: [
      greeting(data.firstName),
      "Good news: the Administration team has reviewed and verified your member profile.",
      "You can see the full details, and anything still in progress, in the app under My Profile.",
    ],
  });
}

// The reason is free text written by a reviewer, so it is the single most
// important value in this feature to escape. It goes in as a plain string and
// the layout escapes it (AC-20).
function profileSentBack(data: ProfileSentBackData): RenderedEmail {
  return render("Your profile needs a few changes", {
    heading: "Your profile needs a few changes",
    paragraphs: [
      greeting(data.firstName),
      "The Administration team looked at your member profile and would like a few things adjusted before verifying it. Here is what they wrote:",
    ],
    quote: data.reason,
    footnote:
      "Open My Profile in the app to make the changes and submit it again. Nothing you already entered has been lost.",
  });
}

function accountDeleted(data: AccountDeletedData): RenderedEmail {
  return render("Your KLT Cyber account has been deleted", {
    heading: "Your account has been deleted",
    paragraphs: [
      greeting(data.firstName),
      `Your ${CHURCH_NAME} account has been deleted, as you asked. Your personal details have been removed from the app.`,
      "You are always welcome back. Creating a new account in the app is all it takes.",
      "Thank you for the time you spent with us.",
    ],
  });
}

// Sent to an address typed into a public page, so this is the one template a
// person may receive without having asked for anything. The copy therefore
// leads with how to make it stop mattering: ignoring it is safe, and nothing
// happens until the link is used. No name, no account details, nothing that
// would confirm membership to somebody who merely guessed the address.
function accountDeletionRequested(
  data: AccountDeletionRequestedData
): RenderedEmail {
  return render(`Confirm deleting your ${CHURCH_NAME} account`, {
    heading: "Confirm deleting your account",
    paragraphs: [
      // Deliberately `null`, never a name: every other template greets the
      // person it knows, and this one greets a stranger, because the address
      // came from a public form. The nameless fallback keeps the "every email
      // greets its reader" invariant without confirming who the reader is.
      greeting(null),
      "Somebody asked to delete the account registered with this email address.",
      "If that was not you, please ignore this email. Nothing has been deleted, nothing will be, and no action is needed on your part.",
      "If it was you, use the button below. It deletes the account straight away: your personal details are removed, your roles are revoked, and it cannot be undone.",
    ],
    action: { label: "Delete my account", url: data.url },
    footnote: `This link works once and expires in ${accountDeletionExpiryLabel()}.`,
  });
}

/**
 * The closed renderer map. The `Record<EmailTemplate, ...>` type is what makes
 * a sixth template a compile error rather than a code review catch.
 */
export const TEMPLATES: Record<
  EmailTemplate,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (data: any) => RenderedEmail
> = {
  welcome,
  password_reset: passwordReset,
  profile_verified: profileVerified,
  profile_sent_back: profileSentBack,
  account_deleted: accountDeleted,
  account_deletion_requested: accountDeletionRequested,
};
