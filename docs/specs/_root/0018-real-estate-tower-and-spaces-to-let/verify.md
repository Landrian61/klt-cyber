# Verify: Real Estate, Tower of Faith and spaces to let · spec 0018 · updated 2026-11-07
_Steps derived from spec 0018 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

## Before you start

You need five accounts to tell the refusals apart. Set them up once and reuse them.

- **Ruth the Real Estate HOD**: an active `hod` role scoped to Real Estate.
- **Derek the delegate**: an active `department_admin` role scoped to Real Estate.
- **Rose the roster member**: a verified profile, an `active` `departmentMemberships` row for Real Estate, and no role at all. She is the one who must get nowhere.
- **Alice the Administration HOD**: an active `hod` role scoped to Administration and no Real Estate role. She is the one who used to be able to edit facilities.
- **Vic the visitor**: signed in, profile not verified, no roster row anywhere.

Also keep a System Admin.

Push the schema first (`pnpm convex`), then seed departments if your deployment is fresh (`pnpm exec convex run seed:departments`). Nothing native is added by this feature, so Expo Go is enough and no preview APK is needed.

There is one schema push, not two. The four old `facilities` fields are left in place deliberately (AC-25), so no step here depends on getting a push order right.

## Commands

- [x] `pnpm --filter @klt-cyber/shared test` → passes, including `realEstate.ts`'s caps, the status union, the error codes and every `isFacilityOpenNow` case → AC-24, AC-22
- [x] `npx vitest run --config convex/vitest.config.ts` → passes, including the new `realEstate.test.ts` → AC-28
- [x] `npx vitest run --config convex/vitest.config.ts convex/departmentShell.test.ts` → the existing `departmentCapabilities` calls still compile and pass unchanged, so adding a second scoped capability broke no caller → AC-1
- [x] `npx tsc -p convex/tsconfig.json --noEmit` → no output
- [x] `pnpm --filter admin build` → compiles, and the route list includes `/areas-of-service/[slug]/tower` and `/areas-of-service/[slug]/spaces` → AC-3
- [x] `pnpm --filter mobile lint` → passes
- [ ] In the Convex dashboard, `realEstateFloors` and `realEstateSpaces` exist with the indexes the spec names, and `facilities` carries `floorId`, `order`, `photos`, `contactWhatsapp`, `responsibleUserId` and `deletedAt` → AC-25
- [x] `npx convex run` each member QUERY (`facilities:listTowerFacilities`, `facilities:getFacility`, `realEstate:listSpacesToLet`, `realEstate:getSpace`) with no session → every one exits 0 and returns null, never throwing → AC-17
- [x] `npx convex run` each Real Estate MUTATION with no session → every one exits 1, so the write path fails closed where the read path fails open → AC-2
- [x] `npx convex run facilities:getFacility '{"facilityId":"not-a-real-id"}'` → exits 0 and returns null, not an argument validation error → AC-23

## The migration

- [ ] Before the push, note the three seeded drafts, give one of them an `imageUrl` by hand in the dashboard, give a second one a deliberately loose `contactPhone` such as `0772 123456`, and leave the third untouched. That gives the backfill one row to copy, one to report and one to skip
- [x] Schema push (new tables plus the optional `facilities` fields) → succeeds against live data, and all three drafts are still readable → AC-25
- [x] `pnpm exec convex run realEstateMigration:backfillFacilityPhotos` → the draft you edited has that URL as `photos[0]`, its `imageUrl` is **still present** (not cleared), the loose phone row is named in the report without being rewritten, and every row has an `order` following `_creationTime` ascending → AC-25
- [x] Run it a second time → reports zero photos copied and nothing duplicated, so it is safe to re run in staging and production → AC-25
- [x] `campusBlock`, `address`, `contactEmail` and `imageUrl` are still in `convex/schema.ts`, each with a comment naming spec 0018 as deprecating it, and no mutation writes any of them → AC-25
- [ ] `pnpm exec convex run seed:facilityDrafts` → the seven SRS names exist as `active: false` with a name only; running it again creates nothing; the three older drafts are untouched → AC-26
- [ ] The row whose loose `contactPhone` was reported: open it in the portal and save → the refusal names the phone field rather than failing obscurely, which is the whole point of having been told in advance → AC-9

## Authority

- [ ] As Ruth, open `/areas-of-service` → the Real Estate card is offered and opening it lands on the Real Estate Dashboard → AC-3
- [ ] As Ruth, the sidebar shows Dashboard, Tower of Faith, Spaces to let, and the shell's own entries; Tower and Spaces are present → AC-3
- [ ] As Derek, the same two pages open and every create, edit, hide, remove and reorder works → AC-1
- [ ] As **Rose**, open `/areas-of-service` → Real Estate is **not** offered as an enterable card, and `/areas-of-service/real-estate` turns her away entirely. She resolves to no shell role at all, which is the whole of SRS 4.14.1 → AC-1
- [ ] As Rose, call `realEstate:createFloor`, `facilities:createFacility` and `realEstate:createSpace` through `npx convex run` → each exits 1 → AC-1, AC-2
- [ ] As **Alice**, call `facilities:createFacility` and `facilities:updateFacility` → each exits 1. This is the permission move: she could do this before → AC-2
- [ ] As Alice, open `/areas-of-service/real-estate/tower` → not found → AC-3
- [ ] As Ruth, open `/areas-of-service/library-information/tower` → not found, since `manageRealEstate` is Real Estate only → AC-1
- [ ] As the System Admin, both pages open and every mutation succeeds → AC-1
- [ ] Confirm `REAL_ESTATE_DEPARTMENT_NAME` is exactly the `name` on the seeded `departments` row, and that the Convex test asserting it passes. Change the constant to `"Real estate"` by hand and watch Ruth lose every capability with no error shown anywhere: that silent failure is why the test exists → AC-24
- [ ] In the Convex dashboard, an `activityLogs` row written by any of the above carries `departmentId` set to Real Estate → AC-14
- [ ] An `activityLogs` row written before this change, with action `facility.created`, still renders in the feed → AC-2

## Floors

- [ ] As Ruth, create floors Ground, First and Second → they list in creation order with `order` 0, 1, 2 → AC-5
- [ ] Create a floor named "ground" → refused with `REAL_ESTATE_FLOOR_NAME_TAKEN`; create one named "Ground  Floor" against an existing "Ground Floor" → refused too, since internal whitespace is collapsed → AC-5
- [ ] Create a floor named "   " → refused with `REAL_ESTATE_FLOOR_NAME_REQUIRED` → AC-5
- [ ] Rename Second to "first" → refused with the take code, so rename is checked too → AC-5
- [ ] Reorder to Second, Ground, First → the three `order` values are 0, 1, 2 with no gap and no tie → AC-5
- [ ] Open the Tower page in two tabs, create a fourth floor in one, then save a reorder from the other (whose list predates it) → the reorder succeeds and the fourth floor is appended rather than the whole save being rejected → AC-5
- [ ] Delete an empty floor → succeeds → AC-6
- [ ] Put two facilities and one space on Ground, then delete it → refused with `REAL_ESTATE_FLOOR_IN_USE`, and the message names two facilities and one space → AC-6
- [ ] Remove both facilities and the space, then delete Ground → succeeds, since a removed row does not hold a floor → AC-6
- [ ] Hide First → it leaves the floor picker on the facility and space forms, and its rows still list in the portal under First, each row labelled "Floor hidden" → AC-7
- [ ] As Vic on mobile, the Facilities tab shows nothing from First while it is hidden, and the Spaces tab likewise hides its available spaces → AC-7
- [ ] As Ruth, the Tower page shows a "Not yet placed" group holding every seeded draft, each row labelled "Not yet placed" → AC-7, AC-27
- [ ] Line up four rows, one for each reason, and confirm each carries its own label rather than a shared "Hidden": one hidden by its own flag, one on a hidden floor, one with no floor, one with no contact. A fully live facility carries no label at all → AC-7

## Facilities

- [ ] As Ruth, create a facility on Ground: name, tagline, description, three services, four photos, hours, a phone and a WhatsApp number → it lists under Ground → AC-8
- [ ] On a facility that already names a typed contact person, set the responsible person to a member → the typed name is **cleared** and the save succeeds, rather than being refused → AC-9
- [ ] Call `updateFacility` directly setting `responsibleUserId` and `contactPerson` in the same call → refused with `REAL_ESTATE_RESPONSIBLE_AMBIGUOUS` → AC-9
- [ ] Set the responsible person to a member whose profile carries a phone number → the facility's own phone and WhatsApp fields stay empty; nothing was prefilled or read from their profile → AC-9
- [ ] Delete the account of a member named as responsible → the detail screen reads "a former member", not a blank → AC-19
- [ ] Enter a phone number as `0772 123456` → refused; enter `+256772123456` → accepted → AC-9
- [ ] Save a facility with the phone field emptied → the number is **cleared**, not left alone, and the facility leaves the app if that was its only contact → AC-8, AC-18
- [ ] Clear a facility's floor (the form's "none" option) → it moves to "Not yet placed" and leaves the app → AC-8
- [ ] Set Tuesday closed, Wednesday 09:00 to 17:00, Friday 22:00 to 02:00 → all three save → AC-10
- [ ] Set a day open 09:00 to 09:00 → refused with `REAL_ESTATE_HOURS_INVALID` as ambiguous; set 00:00 to 23:59 for an all day facility → accepted → AC-10
- [ ] Set an open day with an open time and no close time → refused with `REAL_ESTATE_HOURS_INVALID` → AC-10
- [ ] Confirm in the stored document that weekday `0` is Sunday, and that the portal and the app both display the week starting Monday → AC-10
- [ ] Upload a seventh photo → refused by the form and, called directly, by the mutation → AC-11
- [ ] Call the mutation with the same key twice in one `photos` array → refused with `REAL_ESTATE_PHOTO_DUPLICATE` → AC-11
- [ ] Call the mutation with a key R2 does not hold → refused with `REAL_ESTATE_PHOTO_MISSING` → AC-11
- [ ] Upload a 9 MB image → refused with `REAL_ESTATE_PHOTO_TOO_LARGE`, and the refusal comes from the server even when the form check is bypassed → AC-11
- [ ] Rename a PDF to `.jpg` and upload it → refused with `REAL_ESTATE_PHOTO_TYPE_UNSUPPORTED`, because the content type was read back from R2. A `.heic` is refused by the same code → AC-11
- [ ] Reorder the photos so a different one leads → the mobile card and the detail hero both change to it, **and nothing is deleted from R2**, because a moved key is not a removed key → AC-11
- [ ] Remove a photo → that one R2 object is gone from the bucket and the others are untouched → AC-11
- [ ] Reorder two facilities on Ground → their `order` values are 0 and 1, and the mobile list order matches → AC-12
- [ ] Edit a facility's floor from Ground to Second → it moves group in both the portal and the app, is appended at Second's `max(order) + 1`, and Ground's remaining rows are renumbered with no gap → AC-12
- [ ] Hide a facility → it leaves the mobile app, and the portal still lists it labelled "Hidden" → AC-13
- [ ] Edit the hidden facility → succeeds, since hidden is not removed → AC-13
- [ ] Unhide a facility that has no contact and no floor → the unhide **succeeds** rather than being refused, and the row simply reads "Not yet placed" and stays out of the app. Saving work in progress must never be blocked → AC-13
- [ ] Remove a facility → its photo objects are gone from R2, `photos` is empty, the row is still readable in the dashboard, and its `activityLogs` entries still resolve → AC-13
- [ ] Edit, hide or reorder the removed facility → each refused with `REAL_ESTATE_FACILITY_NOT_FOUND` → AC-13
- [ ] On the backfilled draft (whose photo is an absolute URL, not an R2 key), remove the facility → the delete path skips it rather than failing → AC-11

## Spaces to let

- [ ] As Ruth, create a space on Ground: title, description, 45 square metres, 1,200,000 shillings a month, three photos → it lists as Available → AC-15
- [ ] Create one with no price → it lists, and the app reads "Price on enquiry" → AC-15, AC-20
- [ ] Enter a price of `1200000.50` → refused with `REAL_ESTATE_PRICE_INVALID`; enter `0` → accepted → AC-15
- [ ] Enter a size of `0` → refused with `REAL_ESTATE_SIZE_INVALID` → AC-15
- [ ] Mark a space Reserved → it stays in the app labelled "Reserved" → AC-16, AC-20
- [ ] Mark it Let → it leaves the app, stays in the portal marked "Let" → AC-16, AC-20
- [ ] Mark it Available again → it returns to the app with nothing retyped → AC-16
- [ ] Remove a space → photos gone from R2, later mutations refused with `REAL_ESTATE_SPACE_NOT_FOUND` → AC-16

## The member app

- [ ] As Vic, open the More panel and tap Tower → the Tower screen opens with two tabs. Before this change the entry did nothing → AC-17
- [ ] On a fresh deployment with nothing published, each tab shows its own warm empty state naming what it will hold, not a blank screen and not an endless spinner → AC-17
- [ ] Throttle the network → each tab shows the loading skeleton, then the content → AC-17
- [ ] Stop the Convex dev server and reload → each tab shows the shared error state with a working retry → AC-17
- [ ] The Facilities tab is one scroll with a sticky floor header that changes as you pass each group, floors in their `order`, facilities within a floor in theirs → AC-18
- [ ] A facility with no contact number at all does **not** appear, even with `active` true, a floor, photos and hours → AC-18
- [ ] A facility with no floor does not appear → AC-18
- [ ] Give that facility a WhatsApp number → it appears on the next load → AC-18
- [ ] Open a facility → gallery, description, services, responsible person, the week's hours with closed days marked, and the open status all render → AC-19
- [ ] On a facility whose responsible person is a member, the member's display name shows; on one with a typed name, the typed name shows → AC-19
- [ ] Tap Call → the dialer opens on the stored number exactly as saved. Tap WhatsApp → the chat opens, with the leading `+` stripped from the link → AC-19
- [ ] On a facility with a phone and no WhatsApp, only the Call button renders. With neither, neither renders and the rest of the screen is intact → AC-19
- [ ] The Spaces tab lists newest first with cover, title, floor name, size and either `USh 1,200,000` or "Price on enquiry" → AC-20
- [ ] Open a space with no contact override → the buttons use `departments.contactPhone` for Real Estate → AC-21
- [ ] Give the space its own number → the buttons use that one instead → AC-21
- [ ] Override **only** the space's `contactPhone` and leave its WhatsApp empty → the Call button uses the override and the WhatsApp button still falls back to the department number. The fallback is per field, so one override must not take the other button away → AC-21
- [ ] Clear Real Estate's `departments.contactPhone` on the shared Settings page and open a space with no override → no buttons render, and everything else still shows → AC-21
- [ ] Open a facility deep link for a facility you then hide, then remove, then one on a hidden floor → each says it is no longer available rather than throwing → AC-23
- [ ] Open a space deep link for a space you then mark Let → the same → AC-23

## Open now

- [ ] A facility open Monday 09:00 to 17:00 reads "Open now" at 10:00 Kampala time and "Closed" at 18:00 → AC-22
- [ ] A facility closed Tuesday reads "Closed" all day Tuesday → AC-22
- [ ] **The one that catches a naive implementation:** a facility open **Sunday** 22:00 to 02:00, with Monday itself set closed, reads "Open now" at 01:00 on Monday. Reading only Monday's entry would say "Closed", and would still pass a test that only checked 23:30 on the Sunday → AC-22
- [ ] The same facility reads "Open now" at 23:30 Sunday and "Closed" at 03:00 Monday → AC-22
- [ ] A facility with no opening hours at all reads "Hours not listed" on both the card and the detail screen, never "Closed", and still appears in the app → AC-18, AC-22
- [ ] Set the device timezone to something far from Kampala, such as America/New_York, and reload → the status is unchanged, because the hours are read against the building's clock, not the device's. Check this on the overnight facility too, where a device offset is most likely to flip the weekday → AC-22
- [ ] Sit on the Facilities tab across a closing minute → the label flips without leaving the screen, within about a minute → AC-22
- [ ] Leave the screen and return → the label is current on focus → AC-22
- [ ] The portal's facility row shows the same status for the same facility at the same moment → AC-22

## Dashboard

- [ ] As Ruth, the Dashboard shows the three Real Estate cards below the shared ones → AC-4
- [ ] Facilities listed counts hidden facilities and excludes removed ones → AC-4
- [ ] Incomplete facilities counts a facility missing a contact, one missing every photo (both an absent and an empty `photos` array), one missing hours **and one with no floor**, and the count drops as each is completed. The count agrees with the number of rows carrying a reason label on the Tower page → AC-4, AC-7
- [ ] Spaces available counts only `available`, not `reserved` and not `let` → AC-4
- [ ] On a fresh deployment each card shows its own empty state; with the Convex server stopped each shows the shared error state with a retry → AC-4

## Bounds

- [ ] Every list query in `convex/realEstate.ts` and `convex/facilities.ts` ends in `.take(REAL_ESTATE_LIST_CAP)`; grep for a `.collect()` with no cap and find none → AC-29
- [ ] Read the member queries and confirm the cap is applied **after** the visibility filter, not before. Capping first would let a run of hidden rows push visible facilities off the end with nothing to show it happened → AC-29
- [ ] `listSpacesToLet` reads the `available` and `reserved` index ranges separately and merges them, rather than scanning the table to get two statuses out of one index → AC-20

## Found during the build

_Added by `/develop` on 2026-11-09. Steps the design could not have known about, because they follow from choices the build had to make. Everything above is `/architect`'s and untouched._

### The deploy order, which is the one thing you cannot do out of sequence

- [x] `pnpm convex` first, and let it finish pushing. The new tables and the six optional `facilities` fields have to be live before anything else here works. Only `convex codegen` was run during the build, so the schema is in the source but **not** on your deployment yet → AC-25
- [x] `pnpm exec convex run realEstateMigration:inspectFacilityBackfill` → read it before writing anything. It reports how many rows would gain a `photos[0]`, how many would gain an `order`, how many carry an `imageUrl` it cannot parse, and every `contactPhone` that fails strict E.164 → AC-25
- [x] `pnpm exec convex run realEstateMigration:backfillFacilityPhotos` → the counts match what the inspect predicted. Run it a second time: `photosBackfilled` and `ordersStamped` both come back `0`, every `updatedAt` is unchanged, and the loose phone list is identical. That is idempotence, and it is what makes this safe to run on production → AC-25
- [ ] Any facility the inspect listed under `loosePhones` still holds its original number afterwards, un-rewritten. The migration reports and does not guess, because "0700 123 456" cannot become E.164 without inventing a country code → AC-25

### "Hours not listed" is a third state, and the form has to be able to say it

The facility form carries an **"Opening hours are known"** switch above the weekday editor. It exists because seven all-closed entries and no entries at all are different facts, and without the switch there is no way to express the second once the first has been saved.

- [ ] Add a facility with a contact and a floor, leave **"Opening hours are known" off**, save → the Tower screen card and its detail screen both read **"Hours not listed"**, never "Closed" → AC-18, AC-22
- [ ] Edit that facility, turn the switch **on**, mark every one of the seven days closed, save → both surfaces now read **"Closed"**. This is the opposite answer from the step above, from the same screen, and getting the two confused is the failure this pair is here to catch → AC-22
- [ ] Turn the switch back **off** and save → it returns to "Hours not listed". The clear goes through as an empty `openingHours` array → AC-8, AC-18
- [ ] With the switch on, the dialog's own "Right now a member would see:" line agrees with what the phone shows. It is computed by the same `isFacilityOpenNow`, so a disagreement means one of the two surfaces is not using the shared helper → AC-22

### The reorder absorbs rather than refuses

- [ ] Open the Tower page in two browser tabs. In tab A, drag nothing yet. In tab B, add a new floor. Now in tab A (still showing the old list) reorder two floors and save → the save **succeeds**, your order is kept, and tab B's new floor is appended at the end rather than the whole reorder being rejected → AC-5
- [ ] Repeat with facilities on one floor instead of floors → same behaviour → AC-12
- [ ] After any reorder, no two floors share an `order` → AC-5

### The photo diff, from the operator's side

- [ ] Give a facility three photos. Use the arrow buttons to move the third one to the front, save, reopen → all three are still there and the new first one is the cover. **Nothing was deleted from R2**, because the diff is a set difference, not a positional one → AC-11
- [ ] Remove the middle photo, save → exactly that one object is gone from the bucket and the other two still load → AC-11
- [ ] Try to add a seventh photo → the add button is gone and the hint reads that all six slots are used → AC-11
- [ ] Select eight photos at once with four slots free → the first four upload and a line explains the rest were skipped, rather than the whole drop failing → AC-11

### The responsible person never refuses on the normal path

- [ ] Choose a member from the picker → the typed-name field below it disables and clears itself → AC-9
- [ ] Set it back to "Nobody chosen", type a name, save, reopen → the typed name persisted and no member is selected → AC-9
- [ ] Confirm the picker lists a member whose profile is **not** verified. A facility can reasonably be run by someone who has not finished the wizard, and excluding them would push the operator into typing free text and losing the link → AC-9
- [ ] The picker shows names only. No phone number appears anywhere in it, which is why a facility stores its own numbers → AC-9, security model

### Things the Convex test suite deliberately does not cover

`convex/realEstate.test.ts` cannot drive the mutations, because the harness does not stand up Better Auth (the same limit `convex/library.test.ts` documents). These are therefore yours to drive:

- [ ] `deleteFloor` on a floor holding two facilities and one space → refused, and the message names **both** counts, not a bare "in use" → AC-6
- [ ] Hide that floor instead → all three leave the app, and the portal still lists them under it marked "Floor hidden" → AC-7
- [ ] A 9 MB JPEG, and a `.pdf` renamed `.jpg` → each refused by the **server** even though the form let them through. The browser checks are a courtesy; R2's reported size and content type are the rule → AC-11
- [ ] A removed facility refuses a later edit, hide and reorder, and its photo keys are gone from the bucket → AC-13, AC-11

## Acceptance-criteria coverage, build additions

- AC-5, AC-12 … the two-tab absorption steps · AC-8, AC-18, AC-22 … the hours switch pair · AC-9 … the responsible-person steps · AC-11 … the photo diff and the server refusals · AC-6, AC-7, AC-13 … the steps the test harness cannot reach · AC-25 … the deploy-order block
- **AC-4 is not covered here and cannot be.** The three dashboard cards have no place to render: AC-4 names the shared Dashboard's `extras` slot, which spec 0017 removed on purpose (`apps/admin/components/department/DepartmentDashboard.tsx:33`). `realEstate.getDashboardCards` is built, bounded and returns the three numbers; only the placement is owed. Run `/architect Real Estate: where the three dashboard cards live now that the extras slot is gone` before verifying AC-4.
