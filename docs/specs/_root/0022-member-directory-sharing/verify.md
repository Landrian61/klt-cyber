# Verify: Member directory with sharing · spec 0022 · updated 2026-11-12
_Steps derived from spec 0022 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

Setup you may want: three verified members on your dev deployment. A (sharing on, phone `0772 123 456`), B (sharing on, phone `12345`), C (sharing never set). Plus one visitor V and one pending profile P.

## UI / manual
- [ ] Sign in as V, open Members from the top bar menu → the "There's room for you" invite shows, no list → AC-2 (M5-05)
- [ ] Sign in as A, open Members → A's own row is pinned first with a "You" pill, A is not repeated below, the count counts others only → AC-3
- [ ] The list shows B and C but not V or P; rows are sorted by first name then last name; clan and active Areas of Service show; a pending department claim does not → AC-1
- [ ] Type `gra nam` for a Grace Nambi, then `GRACE`, then `grâce` → she matches every time; `race` does not match → AC-4
- [ ] As A, type part of B's occupation → B matches. Sign in as C and type the same → no match → AC-5
- [ ] Tap Area of Service, pick one → only members active in it remain; add Clan → both apply (AND); tap the x on each chip → each clears in one tap; picker order matches the seeded order → AC-6
- [ ] As A: B's row has the call mark, C's row has none → AC-8
- [ ] As C: no row has a call mark, and the private banner with "Turn on sharing" shows at the top → AC-8, AC-12
- [ ] As A, open B's card → phone, email and the set fields show, empty ones are hidden, birthday shows as "12 March" with no year; Call and Email show, WhatsApp is hidden because `12345` can't be normalized; each tap gives a light haptic → AC-9, AC-10
- [ ] Give B the phone `0772 123 456`, reopen the card → WhatsApp shows and opens `wa.me/256772123456`; Call dials `+256772123456` → AC-9, AC-10
- [ ] As A, open C's card → basics only, "C keeps their details private", no contact buttons → AC-11
- [ ] As C, open A's card → the note says sharing your own details unlocks others, with "Turn on sharing" → AC-12
- [ ] Tap "Turn on sharing" → the sheet lists exactly the 8 shared fields; "Not now" and a scrim tap change nothing → AC-12
- [ ] Confirm the sheet → the banner goes away and contact marks appear without a reload → AC-12, AC-16
- [ ] Open the "You" row → your card with a sharing switch; switch off → instant, no confirm; switch on → the consent sheet opens; the switch only moves after the server confirms → AC-13
- [ ] Keep B's card open on A's phone while B turns sharing off on another device → the contact details vanish on A's screen with no reload → AC-16
- [ ] Open `/member-detail?userId=<V's id>`, then P's id, then a deleted member's id → the same "This member isn't in the directory" state every time → AC-14
- [ ] Turn on airplane mode on the list and on a card → the offline banner shows and loaded content stays; during first load you see the skeleton rows; filter down to nothing → "No members match" with "Clear filters" → AC-15

## Value sourcing checks
- [ ] Change a member's name on their profile (not the users row) → the directory shows the profile name → name source
- [ ] Give a member a profile photo, then remove it on a Google sign in account → the directory falls back to the Google photo, else initials → photo source
- [ ] Point a profile's `clanId` at a deleted clan → the clan is blank, nothing errors → clan source
- [ ] A member with an active and a removed membership → only the active department shows → areas of service source
- [ ] The email on a card is the sign in email of the account → email source
- [ ] A profile with no `dateOfBirth` → no Birthday row on the card → birthday source
- [ ] Remove `directorySharing` from A's profile in the dashboard → A now behaves as private on both sides → viewer sharing source

## Commands
- [x] `pnpm --filter @klt-cyber/shared test -- directory.test.ts` → all pass → AC-4, AC-5, AC-10, AC-17
- [x] `pnpm run test:convex` → `convex/directory.test.ts` passes → AC-2, AC-7, AC-8, AC-14, AC-17

## Acceptance-criteria coverage
- AC-1 list contents · AC-2 visitor invite + Convex suite · AC-3 pinned You · AC-4 search · AC-5 occupation · AC-6 filters · AC-7 Convex suite + card fields · AC-8 marks · AC-9 and AC-10 contact buttons + shared tests · AC-11 private target · AC-12 banner, note, sheet · AC-13 own card switch · AC-14 not found · AC-15 states · AC-16 live updates · AC-17 commands
