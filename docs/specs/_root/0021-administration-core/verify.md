# Verify: Administration core · spec 0021 · updated 2026-11-12
_Steps derived from spec 0021 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

You need three accounts on your dev deployment: the Administration HOD, an Administration delegate, and a Media HOD. A few verified members help too: one on the Media roster, one on the Choir roster, one in clan Reuben, one in clan Judah, and one unverified member with a Choir seat. Each step is a suggestion; run the ones that matter to you.

## Before you start
- [ ] `pnpm convex` is running and the schema pushed with `events.audience` optional → no validation error in the Convex terminal → AC-11
- [ ] `pnpm exec convex run eventAudienceMigration:backfillEventAudience` → `{ patched: N }` where N is the count of events without an audience; run it again → `{ patched: 0 }` → AC-11

## UI / manual

*Dashboard*
- [ ] Sign in as the Administration delegate, open `/areas-of-service/admin` → the Recent activity card lists church actions (profile verified, event created, and so on), with no error → AC-1
- [ ] As the System Admin, grant someone `system_admin` in `/system-admin`, then reload the Administration dashboard as the delegate → that grant never appears in Recent activity → AC-1
- [ ] As the Media HOD, call `admin.listChurchActivity` (Convex dashboard, run as that user, or open the page if your sidebar reaches it) → `null`, no thrown error → AC-1, AC-22
- [ ] On the dashboard, look at the This week card → this week's programs Monday to Sunday in church time, cancelled ones struck through in crimson; the next 5 events with audience chips, including a departments only event the delegate has no seat for; planned activities due in the next 14 days → AC-2
- [ ] Set your computer clock zone to something far from Kampala (for example America/Los_Angeles) and reload → the week still runs Monday to Sunday in Kampala, and the times shown are Kampala times → AC-2 (week bounds source)

*Members directory*
- [ ] Open `/areas-of-service/admin/members` → Phone and Email columns show; no age or date of birth column → AC-3
- [ ] Narrow the window below the `md` width → each member becomes a card showing phone and email → AC-3
- [ ] Open Filters, choose Mentorship "Enrolled" → only enrolled members remain → AC-3
- [ ] Export CSV → the file has Phone, Email and Mentorship columns and no age or date of birth → AC-3
- [ ] Click a member → the sheet shows email, phone, address and next of kin → AC-3
- [ ] Change a member's email on their `users` row (Convex dashboard) → the directory email updates live (email comes from `users`, not the profile) → AC-3 (email source)

*Departments*
- [ ] The Membership group in the sidebar now has Departments and Clans → AC-4
- [ ] Open Departments → each row shows the HOD or a crimson "No HOD", delegate count, verified roster count and claims waiting; paused departments (Ushering and the others) sit at the bottom marked "Coming soon", never flagged → AC-5
- [ ] Give a department only a delegate (no HOD) → it still shows "No HOD" → AC-5
- [ ] Add an unverified member to a roster → the verified roster count does not change → AC-5 (verified count source)
- [ ] Open a department as the Administration HOD → a Head of Department block with "Appoint HOD" or "Replace HOD", and pending claimants in an "Asking to serve here" section with no Confirm button → AC-6
- [ ] Replace that HOD → the old HOD gets N15 privately, the new one N13, the roster N14 → AC-6
- [ ] Open the same page as the delegate → no appoint button → AC-6

*Clans*
- [ ] Open Clans → all 12 in seeded order, each with elder name and photo or a crimson "No elder", and the verified member count → AC-7
- [ ] As the Administration HOD, Appoint on Reuben → the picker lists only verified Reuben members; appoint one → the row shows them → AC-8
- [ ] As the System Admin, in `/system-admin/users/<a Judah member>`, assign Elder of Reuben → the sheet says "This person isn't a verified member of that clan." → AC-8
- [ ] Replace the Reuben elder → the old elder gets N15, the new one N13, the clan N14 → AC-8
- [ ] Remove the Reuben elder (confirm the dialog) → the row shows "No elder", the removed elder gets N15, and `role.revoked` is in the activity log → AC-9
- [ ] As the delegate, open Clans → no Appoint, Replace or Remove buttons, and a note that this is for the Administration HOD → AC-10

*Event audiences*
- [ ] In Events, Add event with audience "Selected departments" and no department ticked → the form refuses to save → AC-11
- [ ] Create an event for Media only → the Media member gets "New Event" on their phone, sees it in Events, Home and the calendar; the Choir member gets nothing and the event is absent → AC-12, AC-13
- [ ] Open the event's deep link as the Choir member → "not available" → AC-12
- [ ] Create an "Everyone serving" event → the unverified Choir seat holder sees it in the app but is not pushed; a verified member with no seat sees nothing → AC-12, AC-13
- [ ] Sign out of the phone and open the Home calendar strip (if reachable signed out) → only whole church events → AC-12
- [ ] Open a department shell's Activities page for Choir → whole church and everyone serving events are listed; a Media only event is not; open the Media shell → it is → AC-16

*Edits and reminders*
- [ ] Edit an event's title only → nobody is notified → AC-15
- [ ] Edit its location → the audience gets "Updated: <title>" (N17) → AC-15
- [ ] Change its audience from Media to Everyone serving → the dialog warns "People outside the new audience will stop seeing this event."; after saving, Choir members get N16, Media members get nothing → AC-15
- [ ] Create a Media event starting in about 26 hours, then add someone to Media → when the day before reminder fires, the newcomer gets "Tomorrow: <title>" (N18) → AC-14
- [ ] Move an event's start → only the new reminder fires, the old one delivers nothing → AC-14

*Cancel*
- [ ] Open an upcoming event, Cancel event, give a reason → the audience gets "Cancelled: <title>" with the reason as the body; the card shows a crimson Cancelled badge and the reason; Edit and Cancel are gone; Archive still works → AC-17, AC-18, AC-19
- [ ] Cancel one with no reason → body reads "<title> on <Kampala day> will no longer take place." → AC-17 (date source)
- [ ] On the phone, the cancelled event stays listed, marked, until its end time passes → AC-19

*Year planner*
- [ ] Open a planned activity, Delete, confirm → it disappears; the activity log has `content.activity_deleted` with the title, target date, departments and status → AC-20
- [ ] Department and clan activities appear on every day they cover, dashed and quiet, labelled with their owner in the day pop up; a cancelled one is struck through in crimson → AC-21
- [ ] Click one → a read only detail opens, never the edit dialog → AC-21
- [ ] Switch off "Show department and clan activities" → they disappear and the legend drops their key → AC-21

## Commands
- [ ] `pnpm --filter @klt-cyber/shared test` → all pass, including `eventAudience.test.ts` and `churchActivity.test.ts` → AC-11, AC-17, AC-1
- [ ] `pnpm test:convex` → all pass, including `convex/administrationCore.test.ts` (19 tests) → AC-1 to AC-22
- [ ] `npx tsc -p convex/tsconfig.json --noEmit` → no errors
- [ ] `npx tsc --noEmit -p apps/admin` and `npx tsc --noEmit -p apps/mobile` → no errors

## Value sourcing checks
- [ ] Activity feed entries: add a log with an action outside `CHURCH_ACTIVITY_ACTIONS` (for example `user.signup`) → it never reaches the card
- [ ] This week events: an Administration viewer with no roster seat still sees a Media only event in the card
- [ ] Directory phone and mentorship: edit them on the profile → the directory updates
- [ ] Departments `hod`: revoke the HOD row → "No HOD"; `delegateCount` counts only `department_admin`
- [ ] Departments `claimsWaiting`: a `pending_claim` row raises it by one
- [ ] Departments `paused`: rename nothing, just confirm the six names in `PAUSED_DEPARTMENTS` are the ones marked "Coming soon"
- [ ] Clans `verifiedMemberCount`: an unverified member claiming Reuben does not raise it
- [ ] Push recipients for departments and serving: a deleted account with a seat is never in the `users` list
- [ ] `cancelledBy`: equals the canceller's user id on the row
- [ ] `expectedStart`: move an event and confirm the old job returns `moved`
- [ ] Planner group rows `ownerName`: rename a department in the dashboard → the planner label follows

## Acceptance-criteria coverage
- AC-1 dashboard steps 1 to 3, Commands · AC-2 dashboard steps 4 and 5 · AC-3 directory steps · AC-4 departments step 1 · AC-5 departments steps 2 to 4 · AC-6 departments steps 5 to 7 · AC-7 to AC-10 clans steps · AC-11 before you start, audiences step 1 · AC-12 and AC-13 audiences steps 2 to 5 · AC-14 and AC-15 edits and reminders · AC-16 audiences step 6 · AC-17 to AC-19 cancel · AC-20 and AC-21 year planner · AC-22 dashboard step 3, clans step 6, Commands
