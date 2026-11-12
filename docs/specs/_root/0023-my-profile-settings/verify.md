# Verify: My Profile and settings · spec 0023 · updated 2026-11-12
_Steps derived from spec 0023 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

## UI / manual

### Profile screen
- [ ] Sign in as a visitor with no profile, open My Profile → gear button shows; tap it → `/settings` opens → AC-1
- [ ] Same visitor taps Edit → `/profile-completion` opens (the wizard) → AC-2
- [ ] Sign in as a sent back person, tap Edit → `/profile-completion` opens → AC-2
- [ ] Sign in as a pending visitor, tap Edit → `/edit-profile` opens; as a verified member → `/edit-profile` opens → AC-2
- [ ] On a slow connection, open My Profile → Edit and the camera badge are dimmed and do nothing until the profile loads → AC-2
- [ ] Set a member's stored `mentorshipStatus` to `enrolled`, then `completed` → the Mentorship row reads "Enrolled", then "Completed", never a fixed value → AC-3
- [ ] Verified member with no clan → MY CHURCH LIFE shows "Your clan will be assigned by the Hospitality team" and the Change your clan card → AC-4
- [ ] Verified member → Areas of Service shows Add, Withdraw and Leave → AC-4
- [ ] Pending visitor with a department claim → Areas of Service lists it with no Add, Withdraw or Leave → AC-4
- [ ] Holder of HOD Media, clan elder Judah and System Admin → roles read "HOD, Media", "clan elder, Judah", "System Admin" → AC-4
- [ ] Seed bootstrapped admin (visitor, no profile, System Admin) → a MY CHURCH LIFE card with the role and the portal pointer still shows → AC-4, AC-5
- [ ] Confirmed Media roster member with no role → portal pointer shows "Media" with an Open web portal button that opens the portal in the browser → AC-5
- [ ] Pending Hospitality claimant → no portal pointer → AC-5
- [ ] HOD whose role was revoked → no portal pointer → AC-5
- [ ] Build without `EXPO_PUBLIC_PORTAL_URL` → the pointer text shows, the button is hidden, and the dev console warns naming the variable → AC-6

### Edit screen
- [ ] Open `/edit-profile` as a verified member → sections Photo, Personal, Contact, Family, Mentorship, Leadership, Profession show current values; no clan, Areas of Service or join date fields → AC-7
- [ ] Open the screen → Save is disabled; change phone and occupation → Save enables; save → back on My Profile with "Profile updated", the new values show, and one `profile.edited` activity log lists exactly `phone` and `occupation` → AC-8
- [ ] Change only the bio and save → the activity log's `fields` does not include `photoUrl` or `mentorshipStatus` → AC-8
- [ ] Empty the phone entirely and save → the phone is removed (sent in `clearFields`) → AC-8
- [ ] Fill only the address city → Save shows "Add the first line of your address, or clear the rest" inline and does not save → AC-9
- [ ] Fill only the next of kin name → relationship and phone each show an inline message → AC-9
- [ ] Blank the first name → inline message, Save blocked; type a 281 character bio → inline message → AC-9
- [ ] Type the phone as `0772 123456` and save → stored as `+256772123456`; type `call me` → inline message → AC-9
- [ ] Pick a new photo → Save is disabled with "Wait for the photo to finish uploading" until the upload finishes; save → the new photo shows on My Profile → AC-10
- [ ] Start a photo upload, then turn on airplane mode so it fails → the old photo stays in the form and is not cleared on Save → AC-10
- [ ] Add a child in its sheet, tap Done → the row appears at once without the main Save; turn on airplane mode and edit a child → the error shows on the sheet only → AC-11
- [ ] Add leadership "Level 1" when Level 1 already exists → the sheet title reads "Edit leadership level" with the note that Done updates it → AC-11
- [ ] As a pending visitor, add a child → the profile's `updatedAt` moves → AC-11
- [ ] Stored mentorship `enrolled` → Completed shows disabled with "Administration confirms this step"; stored `completed` → the field is locked with "Administration changes this"; other fields still save → AC-12
- [ ] Change a field, then press back, swipe back (iOS) and Android back → each asks "Discard changes?"; Keep editing stays; Discard leaves → AC-13
- [ ] Open a child sheet, type a name, press Android back → "Discard changes?" for the sheet → AC-13
- [ ] With no changes, back leaves silently; during a Save, back does nothing → AC-13
- [ ] Turn on airplane mode, Save → edits stay, "Couldn't save, check your connection and try again" shows, Save stays available → AC-14
- [ ] Have a reviewer send the profile back while the edit screen is open → the form is replaced by the sent back message and an Open your submission button, with no discard prompt → AC-15
- [ ] Open the edit screen, change the employer from the portal Settings, then save a phone change on the phone → both the employer and the phone survive → AC-16

### Settings
- [ ] Verified member opens Settings → groups in order Privacy, Notifications, Account, Help; a visitor and a pending visitor see no Privacy → AC-17
- [ ] Toggle "Let other members find me" → it saves on toggle and the switch holds the stored value; My Profile no longer has the directory card → AC-18
- [ ] Notifications → the permission row and Followed radio programs show, no "coming soon" text; the radio row opens `/radio-follows` → AC-19
- [ ] Sign out in airplane mode → it still signs out; Delete account opens `/delete-account`; neither is on My Profile any more → AC-20
- [ ] Google only account → the Account row reads "You sign in with Google or another provider" and does nothing; a password account sees Change password → AC-21
- [ ] Change password with a wrong current password → "That isn't your current password" inline; a 7 character new password → "Use at least 8 characters"; mismatched confirm → "The new passwords don't match" → AC-22
- [ ] Change password successfully while signed in on a second device → confirmation says other devices were signed out; this device stays signed in; the second device is really signed out (allow for its current Convex token running out) → AC-22
- [ ] Help with `SUPPORT_CONTACT.whatsapp` empty → "Help isn't set up in this build yet" and no button → AC-24
- [ ] Set a number and tap Message on WhatsApp → WhatsApp opens with "Hi, I need help with the KLT app (v<version>, Android)." and nothing personal → AC-23
- [ ] Every new row and button gives a light haptic; with reduce motion on, the cards appear without the entrance motion → AC-25
- [ ] Each new screen shows a spinner while loading and an error state when its data fails → AC-26

### Value sourcing
- [ ] Profile header photo: a member with an uploaded photo and a Google picture → the uploaded photo shows; remove it → the Google picture shows
- [ ] Edit target: flip the stored `profileStatus` between `pending_verification`, `verified`, `sent_back` → Edit goes to edit, edit, wizard
- [ ] Mentorship lock: change the stored status in the dashboard while the edit screen is open → the lock does not change (it reads the snapshot), and a save that conflicts is refused with the AC-14 copy
- [ ] Clan name: rename a clan in the dashboard → My Profile shows the new name
- [ ] Roles scope name: rename the department behind an HOD role → the role line shows the new name
- [ ] Portal pointer: rename a department so it is no longer in `ROSTER_PORTAL_DEPARTMENTS` → its roster members lose the pointer (this is why the names are typed constants)
- [ ] Children and leadership rows: add a child from the wizard of another session → the edit screen lists it live
- [ ] Spouse candidates: search for a pending (unverified) person → they do not appear
- [ ] Credential check: a person with both Google and a password → Change password shows
- [ ] Help version: a build where `expoConfig.version` is missing → the message reads "(Android)" alone
- [ ] Help platform: on iOS → the message says "iOS"

## Commands
- [ ] `pnpm exec vitest run --config convex/vitest.config.ts convex/profileChurchLife.test.ts` → 8 passed → AC-5, AC-26, AC-27
- [ ] `pnpm --filter @klt-cyber/shared test -- profileEdit.test.ts settings.test.ts` → all pass → AC-8, AC-9, AC-23, AC-24, AC-27
- [ ] `cd apps/mobile && npx tsc --noEmit -p .` → exit 0
- [ ] `pnpm --filter mobile lint` → no problems

## Acceptance-criteria coverage
- AC-1, AC-2, AC-3, AC-4, AC-5, AC-6 · Profile screen steps
- AC-7 to AC-16 · Edit screen steps
- AC-17 to AC-24 · Settings steps
- AC-25, AC-26 · cross cutting steps at the end of Settings
- AC-27 · Commands
