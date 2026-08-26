# Administration Portal — Page-by-Page Spec

Plain-language companion to the module plan — no schemas, no technical component
names. This is the full picture of what a person sees and does on every screen.

---

## Who uses this portal

**System Admin.** A technical account, not a church member — it won't show up in
any member list anywhere. Can enter any of the 13 departments and do anything in
any of them, including naming Administration's very first HOD before anyone else
has the standing to do it.

**Administration's Head of Department (HOD).** The person System Admin appoints to
run Administration. Can do everything below, plus the handful of things that are
reserved for the head specifically: removing someone from the roster, re-titling a
roster member, appointing delegates, and — because Administration is the church's
operational hub — naming the heads of the other 12 departments.

**Administration's delegate (`department_admin`).** Someone the HOD has appointed
to help run day-to-day work. Full access to the routine parts of every page below,
except the handful of head-only actions just mentioned.

Everyone else — ordinary verified members — never sees this portal at all. They're
what this portal manages, not who uses it.

---

## User stories

**System Admin**
- I can see all 13 departments and step into any of them.
- I can name Administration's first HOD when none exists yet.
- I can undo any appointment, anywhere, if something needs correcting.

**Administration's HOD**
- When I open the portal, I can see at a glance what needs my attention.
- I can look at a submitted profile, fix a mistake in it, and approve or send it back.
- I can search every verified member in the church, not just my own department.
- I can add a verified member to Administration's roster.
- I can remove someone from the roster and trust that any authority they held here
  goes with them.
- I can hand day-to-day roster work to a delegate without giving up control.
- I can put someone in charge of another department.
- I can keep the weekly schedule, one-off events, and announcements up to date.
- I can see what the church has planned for the months ahead.

**Administration's delegate**
- I can do the routine work — adding members, keeping the schedule and
  announcements current — without needing the HOD for every small thing.

**A verified member** (context only — not a portal user)
- My submitted profile gets looked at and either approved or sent back with a reason.
- Once I'm verified, any department's HOD can find and add me.

---

## Navigation

Every authorized person sees the same eight pages — the difference between HOD,
delegate, and System Admin is which *actions* are available within a page, not
which pages exist. Noted per page below.

**Overview** — Dashboard
**Membership** — Verification Queue · Members Directory · Roster
**Programs & Content** — Weekly Program · Events · Announcements
**Planning** — Year Planner

---

## Dashboard

**What's on the page.** A short welcome area, then a row of four numbers, then two
side-by-side lists.

**The four numbers:** pending verifications, current roster size, programs
happening this week, active announcements.

**The two lists:** recent activity (what just happened in the department — a
profile got verified, someone joined the roster, an announcement went out) and
what's coming up next (a merged view of upcoming weekly programs and events).

**What you interact with.** The pending-verifications number is clickable and
jumps to the Verification Queue. Any line in either list can be clicked to jump to
that record. Nothing else — this page is a starting point, not a workspace.

**Same for everyone** — HOD, delegate, and System Admin all see an identical
Dashboard.

---

## Verification Queue

**What's on the page.** A list of everyone who has submitted a profile and is
waiting to be reviewed.

**List fields:** photo, name, date submitted, whether they uploaded proof of
completing mentorship, sex, marital status.

**Two ways to work through it.** List view is the default, and it does the job that
matters most here: scanning the whole queue at once, sorting by how long someone's
been waiting, and spotting who's missing mentorship proof before opening anything. A
photo-first grid was considered and set aside — recognizing a face isn't the
decision being made here, the data fields are, so a grid would trade scannable
information for something that looks nicer but reviews slower.

The one alternative worth offering is **Review mode** — a "start reviewing" toggle
that steps through pending submissions one at a time, full detail already open, no
need to click in first. Each one offers Approve, Send back (with an optional short
note on what needs fixing), or Skip, then moves to the next automatically, with a
small counter showing progress through the queue. You can exit back to the list at
any point. List view is for figuring out what needs attention; Review mode is for
actually clearing the queue once someone's sat down to do it.

**What you interact with.** In list view: a search box to find someone by name, and
clicking a row opens their full submission — everything they entered, organized
into sections (personal details, family, mentorship proof, area of service and clan
interest) — with the mentorship certificate shown as an image if one was uploaded.
Any field can be corrected before deciding what to do. Review mode shows the same
content, just one submission at a time instead of via a click-through.

**Actions:** search, open a submission, correct a field, approve (which makes the
person an official member), or send it back for correction with an optional note.
Same for HOD, delegate, and System Admin.

---

## Members Directory

**What's on the page.** Every verified member in the whole church — not just
Administration's roster. This is the lookup tool an HOD uses to find someone before
adding them to a department.

**Fields shown:** photo, name, sex, marital status, clan, which area(s) of service
they already belong to, date verified.

**What you interact with.** Quick filter buttons for common groupings (men, women,
youth, elders, and similar), a search box, and sortable columns. Clicking anywhere
on a row opens a sheet — a panel that slides in from the side — showing that
person's full profile.

**Actions:** filter, search, sort, click a row to view someone's full profile.
Nothing here is editable — it's a lookup page, not a management one. Same for HOD,
delegate, and System Admin.

---

## Roster

**What's on the page.** Administration's own list of members — the people actually
serving in this department, as distinct from the church-wide directory above. A
count at the top, an "add member" button, and a table below.

**Table fields:** photo, name, position/title (if one's been given), date added,
who added them.

**Clicking a row.** Opens the same kind of sheet as the Directory — the member's
full profile — but here it also carries Administration-specific actions at the
bottom, since this is a management page rather than a lookup one: change their
title, remove them from the roster, or (HOD only) appoint them as a delegate.
Keeping every per-person action inside that one sheet, rather than splitting them
into a separate row menu, gives a single, consistent place to go for anything
concerning a specific roster member.

**Adding someone.** Clicking "Add member" opens a search limited to already-verified
members. Picking someone adds them, with an optional title the person adding them
can type in (like "Secretary"). Anyone already serving in three departments shows up
in the search but can't be picked, with a short explanation why.

**Actions and who can do them:**
- Add a member — HOD and delegate
- Open a row to view the person's full profile — HOD, delegate, and System Admin
- Change someone's title, from within their sheet — **HOD only.** Re-titling is
  the head's call, the same as removal. A delegate can add someone (with a
  title typed at that moment) but cannot re-title them afterwards.
- Remove a member, from within their sheet — **HOD only.** If the person removed
  also held a leadership role in Administration, that's taken away in the same
  step, automatically.
- Appoint a delegate, from within their sheet — **HOD only**
- Name the HOD of one of the other 12 departments — **HOD only.** This stays a
  separate, clearly-labeled action near the top of the page rather than living
  inside any one person's sheet — it isn't about a roster member at all, it reaches
  into the wider church-wide directory to pick someone for a different department.

**System Admin** sees everything the HOD sees, all actions available, plus one more:
if Administration has no HOD yet, this page shows a prompt to name the first one,
since nobody else is in a position to.

---

## Weekly Program

**What's on the page.** The recurring weekly schedule — Sunday service, Wednesday
prayer meeting, and similar — the things shown on the mobile app's home screen every
week. Usually a short list, an "add program" button.

**Table fields:** day of the week, title, time, location, on/off status.

**Adding or editing:** a small form — title, short description, day, time,
location, a cover image, and a switch to turn it on or off without deleting it.

**Actions:** add, edit, switch on/off. Same for HOD and delegate.

---

## Events

**What's on the page.** One-off events — a youth outreach day, a conference — shown
on mobile separately from the weekly schedule. A toggle between upcoming and past,
an "add event" button, and events shown as a grid of cards rather than a table,
each led by its cover image — a visual listing reads better as something to browse
than as rows of data.

**Card fields:** cover image, title, date and time, location, a marker if featured.

**Adding an event.** Clicking "Add event" opens a pop-up with the form: title,
description, location, start and end date/time, cover image, a featured toggle, an
on/off toggle.

**Viewing or editing an event.** Clicking a card opens a pop-up with everything
about that event, editable right there — no separate edit screen.

**Actions:** add, view, edit, mark featured, switch on/off. Same for HOD and delegate.

---

## Announcements

**What's on the page.** Church-wide announcements shown on the mobile app's updates
feed. The three status tabs — Draft, Published, Archived — stay, but within each,
announcements show as cards rather than table rows, the same pattern as Events:
cover image leading each card.

**Card fields:** cover image, title, category, priority (shown as a colored label).

**Adding an announcement.** Clicking "Add announcement" opens a pop-up with the
form: title, body text, category, priority, a cover image, any links to include, a
start date, an end date, and a choice to save as a draft or publish immediately.

**Viewing or editing an announcement.** Clicking a card opens a pop-up with the
full announcement, editable right there.

**Actions:** write, view, edit, publish, archive. Same for HOD and delegate.

---

## Year Planner

**What's on the page.** A full calendar, not a list. The default view is the whole
year at a glance — twelve small months in a grid. A toggle steps that down to a
quarter, a single month, or a single week, each showing more detail as it narrows —
the way Google Calendar's zoom levels work.

**What a day shows.** Any day with something happening — a weekly program
occurring that day, a one-off event, or a planned activity — carries a small
marker. Clicking on any day, at any zoom level, opens a pop-up listing everything
on that day, each item labeled by what it is, so planning ahead shows the full
picture, not just what's being added.

**Adding an activity.** An "add activity" button stays available at the top for
adding without navigating the calendar first; clicking an empty day offers the same
thing, pre-filled with that date.

**Fields on a planned activity:** title, description, which month, which area(s) of
service are responsible (more than one can be picked), a target date, a status
(planned / in progress / done).

**Actions:** switch between year, quarter, month, and week views; click a day to
see what's on it; add an activity, from the top button or from a day directly;
edit an activity; update its status. Same for HOD and delegate.

A future addition, not needed for this to already be useful: everyone responsible
for that month's activities gets notified automatically when the month begins.