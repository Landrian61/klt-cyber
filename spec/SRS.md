# KLT Cyber Church App: Software Requirements Specification

**Phase 01 (MVP)**

| | |
|---|---|
| Version | 1.0 |
| Date | 30 September 2026 |
| Status | Agreed for implementation |
| Owner | Andrew Luswata (Landrian61) |
| Launch target | Sunday 29 November 2026 |

---

## 0. How to use this document

- This SRS is the **single source of truth** for what the KLT Cyber Church App does in Phase 01. Where the code, older documents or the original church specification disagree with it, this document wins.
- It lives at `spec/SRS.md` and replaces the old `docs/` folder, which is deleted (see F5-01). `AGENTS.md` and `CLAUDE.md` describe how to work in the code; they point here for all product behaviour.
- Changes to this document go through a normal pull request. Each change updates the version table at the end (Section 13).
- Requirements are written as user stories with an ID, key rules and an implementation status. The IDs are stable: they are never renumbered, and removed stories are marked as removed rather than deleted.

### 0.1 Status labels

Every story carries one status, measured against the as-built product map of 29 September 2026 (commit `b847b7e`):

| Label | Meaning |
|---|---|
| **Built** | Exists and behaves as described. Keep, and check during testing. |
| **Change** | Exists but must be adjusted, fixed, moved or removed as described. |
| **New** | Does not exist yet. |

### 0.2 Story ID prefixes

| Prefix | Area | Section |
|---|---|---|
| F1 | Identity and accounts | 4.1 |
| F2 | Membership lifecycle | 4.2 |
| F3 | Roles, access, clan portal, platform analytics | 4.3 |
| F4 | Notifications | 4.5 |
| F5 | Platform and release | 8 |
| M | Mobile member app | 4.6 |
| S | Shared department shell | 4.7 |
| A | Administration | 4.8 |
| R, RC, RI, D, P, ST | Media: radio, recordings, radio insights, devotionals, past events, Super T | 4.9 |
| H | Hospitality | 4.10 |
| FN | Finance | 4.11 |
| PS | Pastoral | 4.12 |
| L | Library & Information | 4.13 |
| RE | Real Estate | 4.14 |

---

## 1. Introduction

### 1.1 Purpose

The KLT Cyber Church App is Kingdom Life Tabernacle's digital church platform. It connects members to church life (programs, events, announcements, Reign Radio, devotionals, giving, the member community) and gives church departments a web portal to run their work.

This document specifies Phase 01: the first release used by real people, launched to about 50 church ministers on 29 November 2026 and later opened to the whole congregation.

### 1.2 Vision

To grow God's people into spiritual maturity so that they may manifest Kingdom life holistically, through a digital church ecosystem that connects members, enhances spiritual growth and streamlines church administration.

### 1.3 Scope of Phase 01

**In scope**

- The **mobile member app** (Android and iPhone).
- The **web portal** for these Areas of Service: **Administration, Pastoral, Finance, Media, Hospitality, Real Estate, Library & Information**.
- The **clan portal** for clan elders.
- Platform-level tools for the **System Admin** (inside the Administration portal).

**Paused Areas of Service** (shown as "Coming soon"): Education, Worship Ministry, Ushering, Missions & Outreach, Children's Ministry, Eagles Youth.

**Out of scope for Phase 01:** everything listed in the deferred register (Section 10).

### 1.4 Launch context

| Item | Decision |
|---|---|
| Launch date | Sunday 29 November 2026 |
| First users | About 50 church ministers across the in-scope Areas of Service; clan elders are likely among them |
| Pilot | Custein runs the pilot alongside Andrew. Ministers are invited to sign in and complete profiles before launch. |
| Distribution | Invite-only testing channels: Google Play internal or closed testing, and Apple TestFlight external testing. Public store listings come later. |
| Language | English only |
| Devices | About 80% of ministers have capable smartphones; testing includes at least one lower-end Android phone |
| Team | Andrew with Claude Code (about 24 hours a week) |
| Support | Ministers contact Andrew |
| Running costs | Covered by Church Finance |

**Working calendar**

| Dates | Focus |
|---|---|
| 24 Sep to 2 Oct | Finish planning; start non-code tasks |
| 5 to 9 Oct | Production environment, then launch-blocking fixes |
| 12 Oct to 13 Nov | Department shell, then module work in ranked order |
| 16 Nov | Feature freeze. Pilot starts on production with three to five ministers. |
| 23 Nov | All ministers invited; verification and roster setup |
| 29 Nov | Launch |

### 1.5 Definitions

| Term | Meaning |
|---|---|
| **Account** | A sign-in identity (email and password, or Google). Every person has one. |
| **Visitor** | A signed-in account without a verified member profile. Includes people with a profile pending review or sent back. |
| **Member** | A person whose member profile has been verified by Administration. |
| **Walk-in visitor** | A person recorded by Hospitality at the welcome desk who has no account. |
| **Area of Service / Department** | One of the 13 seeded church departments (Administration, Pastoral, Finance, Education, Media, Worship Ministry, Ushering, Missions & Outreach, Hospitality, Children's Ministry, Eagles Youth, Real Estate, Library & Information). |
| **Roster** | The verified members confirmed as serving in a department. A person serves in at most three. |
| **Claim** | A member's statement on their profile that they serve in a department; pending until that department's HOD confirms it. |
| **HOD** | Head of Department. One per department; one HOD role per person. |
| **Delegate** | A roster member appointed by the HOD to help run the department (stored as `department_admin`). |
| **Clan** | One of the 12 seeded clans, named after the tribes of Israel. Identity, not service. |
| **Clan Elder** | The leader of one clan. One per clan. |
| **System Admin** | A master-key role that can open every portal. No separate portal. |
| **Team Leader** | The church's highest leader; ideally the Pastoral HOD. |
| **Web portal** | The Next.js web application used by role holders (and roster members of Media, Hospitality and Library). |
| **Areas of Service hub** | The page after portal sign-in listing the departments and clan a person can open. |
| **Event** | A church-wide happening created only by Administration, with an audience (Section 4.8). |
| **Activity** | A happening that belongs to one department or one clan (meeting, rehearsal, gathering). |
| **Planned activity** | An internal Year Planner note; never shown to members. |
| **Weekly program** | A recurring church program owned by Administration (e.g. Midweek Service). |
| **Broadcast** | A scheduled Reign Radio slot owned by Media. Separate from the weekly program. |
| **Super T** | A 24-hour Tuesday prayer broadcast in which the 12 clans each hold two one-hour **gates**. |
| **Gate** | One hour of prayer on Super T held by one clan. |
| **Radio inbox** | Prayer requests and testimonies sent from the Radio tab, seen by Pastoral and Media. |
| **Sharing (directory)** | A member's choice to share contact and work details in the member directory. |
| **Web bell** | The notification bell in the web portal. |
| **Staging** | The rehearsal environment; holds sample data. |
| **Production** | The live environment used by real ministers; never holds sample data. |

### 1.6 References

- The church's original specification, *KLT Cyber Church APP* (pilot version structure), used as background. This SRS supersedes it for Phase 01.
- The as-built product map of 29 September 2026.

---

## 2. Overall description

### 2.1 Product surfaces

| Surface | Users | Technology |
|---|---|---|
| **Mobile member app** | Everyone | React Native (Expo) |
| **Web portal** | Role holders, plus roster members of Media, Hospitality and Library | Next.js 16, shadcn/Tailwind; authentication via Better Auth |
| **Backend** | Both surfaces | Convex (database, functions, scheduling), Cloudflare R2 storage |
| **Shared packages** | Both surfaces | `packages/shared` (validation schemas and tests) |

The mobile app has **no admin tools**. All management work happens in the web portal, whose pages must work well in a phone's browser.

### 2.2 User classes

| Class | Description | Main surface |
|---|---|---|
| Walk-in visitor | Recorded by Hospitality; no account | None (receives SMS) |
| Visitor | Signed-in account, not yet verified | Mobile |
| Member | Verified member profile | Mobile |
| Department roster member | Member serving in a department | Mobile; web portal for Media, Hospitality and Library only |
| Delegate | Appointed helper in a department | Web portal and mobile |
| HOD | Head of a department | Web portal and mobile |
| Clan Elder | Leader of a clan | Web portal (phone browser) and mobile |
| Administration HOD and delegates | Central office | Web portal |
| Pastoral HOD (Team Leader) and delegates (pastors) | Spiritual leadership | Web portal and mobile |
| System Admin | Platform master key | Web portal |

### 2.3 Design principles

1. **Every permission is enforced on the server.** Hiding a button is never the only protection. Buttons a person cannot use are not shown.
2. **Privacy by default.** Directory sharing is off until the member turns it on. Contact details of walk-ins require consent.
3. **The app never handles money.** Giving happens outside the app. Nothing about giving is recorded.
4. **Editable data, not hard-coded content.** Themes, giving details, facilities, schedules and similar change without an app release.
5. **Nothing looks finished that isn't.** No mock data, locked tiles or dead buttons reach users.
6. **Notify only the people concerned.** Nothing goes to everyone unless it is for everyone.

### 2.4 Constraints

| Constraint | Effect |
|---|---|
| Apple and Google policies | In-app account deletion is required. Paid digital content would need Apple's in-app payments, so none is sold. iPhones block apps from pre-filling dial codes containing `*` or `#`. |
| Uganda Data Protection and Privacy Act | Consent for directory sharing and walk-in contact; anonymized deletion; access limited by role. |
| Capacity | One developer with Claude Code, about 144 build hours before feature freeze. Items are ranked; the lowest-ranked work is hidden rather than the launch moved. |
| Connectivity | Many users are on mobile data; every screen handles poor connections with a retry. |

### 2.5 Assumptions and dependencies

- The church buys a domain for email sending and public pages.
- The church obtains a D-U-N-S number and opens Apple and Google developer accounts in its own name.
- MTN and Airtel merchant codes, pay numbers and recipient names are known and tested on real SIMs.
- Caster FM continues to carry the radio stream.
- Africa's Talking approves the "KLT" SMS sender ID; until then messages come from a generic number.

---

## 3. Roles and access

### 3.1 Role model

- **Consumer lifecycle** (stored on the account): visitor or member.
- **Administrative roles** (stored as role assignments): `system_admin`, `hod` (scoped to a department), `department_admin` (delegate, scoped to a department), `clan_elder` (scoped to a clan).
- **Department membership** (stored as roster memberships): up to three departments per person, with a free-text position.
- Mentorship never blocks verification, joining a department or becoming HOD.

### 3.2 Web portal access

A person can sign in to the web portal if **any** of the following is true:

1. They hold at least one administrative role.
2. They are on the **Media**, **Hospitality** or **Library & Information** roster (these departments give portal access to every roster member).

Everyone else sees a page directing them to the mobile app. The web portal has no sign-up.

After sign-in, the **Areas of Service hub** lists every department the person can open, their clan if they are an elder, and paused departments marked "Coming soon". A System Admin sees every department and clan. Each department shows its fixed built-in icon.

### 3.3 Department portal access summary

| Department | Portal users | Notes |
|---|---|---|
| Administration | HOD, delegates | Also hosts System Admin-only pages |
| Pastoral | HOD (Team Leader), delegates (pastors) | Read-only views across the church |
| Finance | HOD, delegates | Only the HOD changes payment details |
| Media | HOD, delegates, **all roster members** | |
| Hospitality | HOD, delegates, **all roster members** | |
| Library & Information | HOD, delegates, **all roster members** | |
| Real Estate | HOD, delegates | |
| Paused departments | None | "Coming soon" |
| Clan portal | That clan's elder; System Admin for all clans | |

### 3.4 Permission matrix (platform-wide)

Department-specific permissions are listed in each department's section (4.8 to 4.14).

| Capability | Visitor | Member | Delegate | HOD | Clan Elder | Admin. HOD / delegate | Pastoral HOD / delegate | System Admin |
|---|---|---|---|---|---|---|---|---|
| Read church content (signed in) | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes |
| Submit and edit own profile | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes |
| Member directory (share-to-see) | No | Yes | Yes | Yes | Yes | Yes | Yes | Yes |
| Own department roster with full profiles | No | No | Yes | Yes | No | All departments | All departments, read-only | Yes |
| Add a verified member to own roster | No | No | Yes | Yes | No | Yes | Own dept | Yes |
| Confirm or decline claims, set positions, remove, appoint delegates | No | No | No | Own dept | No | HOD only | HOD only (own dept) | Yes |
| Department activities and messages | No | No | Yes | Yes | No | Yes | Yes | Yes |
| Send notices to other HODs | No | No | No | Yes | No | HOD only | HOD only | Yes |
| Clan members, messages, activities, Super T assignment, clan listening | No | No | No | No | Own clan | No | Clan lists read-only | All clans |
| Verify or send back profiles; confirm mentorship | No | No | No | No | No | Yes | No | Yes |
| Church events, announcements, weekly program, year planner | No | No | No | No | No | Yes | No | Yes |
| Appoint any department's HOD | No | No | No | No | No | HOD only | No | Yes |
| Appoint clan elders | No | No | No | No | No | HOD only | No | Yes |
| Home content (themes, welcome, vision, core values) | No | No | No | No | No | No | Yes | Yes |
| Radio inbox | No | No | No | No | No | No | Yes | Yes (Media also) |
| Radio Insights | No | No | No | No | No | No | Yes | Yes (Media also) |
| Grant or revoke System Admin; accounts; audit log; platform analytics; cost register | No | No | No | No | No | No | No | Yes |
| Emergency switch-off of a payment method | No | No | No | No | No | No | No | Yes |

### 3.5 Who sees contact details

| Viewer | Whose contact details |
|---|---|
| A sharing member | Other sharing members (directory) |
| HOD and delegates | Their own roster and pending claimants, regardless of sharing |
| Clan Elder | Their own clan members, regardless of sharing |
| Administration | All members |
| Pastoral HOD and delegates | All members, read-only |
| Media | Members assigned to this week's Super T gates only |
| Hospitality | Visitors with consent |

Members are told plainly, when claiming a department or choosing a clan, that their leaders will see their full profile.

---

## 4. Functional requirements

### 4.1 Identity and accounts (F1)

**Goal:** every person has one account, can always get back into it, can leave if they choose, and is recognized by the same name and photo everywhere.

| ID | Story | Key rules | Status |
|---|---|---|---|
| F1-01 | As a newcomer, I create an account on mobile with name, email and password, or with Google. | Starts as visitor. Password at least 8 characters. Google sign-in is wired on the backend and switched on in production. | Change (Google is New) |
| F1-02 | As a portal user, I sign in to the web portal with the same account I use on mobile. | No web sign-up. Access rules in Section 3.2. | Change: remove web sign-up |
| F1-03 | As a user who forgot my password, I request a reset link by email and set a new password. | Link expires. The screen shows the same message whether or not the email exists. | New |
| F1-04 | As a signed-in user, I change my password. | Requires the current password. | New (optional for launch) |
| F1-05 | Suspension | **Removed from the product.** Suspend and reactivate controls, the status field and the badge are removed. | Change: remove |
| F1-06 | As a user, I delete my account from inside the app. | Roles revoked, rosters left, personal data **anonymized** (not erased). The audit log keeps an anonymized record. A public web page for deletion requests is also published. Confirmation email sent. | New |
| F1-07 | As anyone viewing a person, I see the same name and photo everywhere. | One source of truth: profile changes update the account copy. | Change |
| F1-08 | As a user, I sign out, and my device stops receiving my notifications. | | Built |
| F1-09 | As a signed-in user, reopening the app takes me straight to Home. | Session persists until sign-out, account deletion or long-period expiry. Today the app asks for sign-in on every launch; the cause must be investigated, not assumed. **Launch blocker.** | New |
| F1-10 | As a new user, I receive a welcome email after signing up. | Via Resend. | New |
| F1-11 | As any user, my "last active" time is recorded when I use the app or portal. | Feeds active-user counts (F3-17). | New |

**Email rules**

- Service: **Resend**, sending from an address on the church-owned domain (e.g. `no-reply@<church-domain>`) with replies to **kingdomlifeug@gmail.com**.
- **Exactly five events send email, nothing else:** welcome on sign-up; password reset; profile verified; profile sent back (with the reason); account deletion confirmed.

---

### 4.2 Membership lifecycle (F2)

**Goal:** one clear path from visitor to member. People keep their details current at every stage, and departments see who has claimed them without misleading numbers.

| ID | Story | Key rules | Status |
|---|---|---|---|
| F2-01 | As a visitor, I submit my member profile through the 7-step wizard. | One submission per person. The clan step offers the clans and **"I don't know my clan"**. The last step asks for the directory sharing choice. | Change |
| F2-02 | As a pending visitor, I see clearly that my profile is waiting for review by "the Administration team". | Same reviewer name everywhere. No "welcome home" wording before verification. | Change: wording |
| F2-03 | As a pending visitor, I edit my submission while it waits. | Reviewers always see the latest version. | New |
| F2-04 | As an Administration reviewer, I verify a profile, correcting fields if needed, and the person becomes a member. | **Independent of mentorship.** Remove the misleading code comment. | Built |
| F2-05 | As an Administration reviewer, I send a profile back with a written reason. | Person notified by push, in-app and email with the reason; edits and resubmits; it returns to the queue marked "Resubmitted". | New |
| F2-06 | As a member, I edit all my profile details on mobile after verification, including photo, family, children, profession, mentorship and leadership status. | Saves immediately and is logged, except F2-07, F2-08 and F2-14. | New |
| F2-07 | As a member, I add or remove an Area of Service. | Adding creates a pending claim. Removing is **blocked while I am HOD or delegate there**. Maximum three active. | New |
| F2-08 | As a member, I change my clan. | Saves immediately; the new clan's elder is notified; logged. | New |
| F2-09 | As a member, I edit the same details from the web portal's Settings. | Same rules as mobile. Today only 8 fields are editable. | Change |
| F2-10 | As an HOD, I see people who claimed my department before verification. | Marked pending, excluded from counts and analytics, not appointable until verified. | Change |
| F2-11 | As a member, my profile shows my real mentorship status. | Today it always shows "Completed". | Change: bug |
| F2-12 | As a visitor linking my spouse, I search by name. | Results show name and photo of verified members only, never email. | Change: privacy fix |
| F2-13 | As a member, the directory shows my details according to my sharing choice. | Directory rules below and M5. | New |
| F2-14 | As a member, a change of my mentorship status to "Completed" waits for Administration to confirm it. | Previous status stands until confirmed; I'm notified either way. | New |
| F2-15 | As a verified member who hasn't completed mentorship, I'm reminded to complete it. | Home banner plus a monthly push; stops once "Completed" is confirmed. Mutable. | New |
| F2-16 | As a verified member without a clan, my profile says "Your clan will be assigned by the Hospitality team". | Hospitality places unassigned members only (H5). | New |

**Mentorship (lenient rule)**

- Mentorship does not block verification, department membership or HOD appointment.
- HODs see each roster member's mentorship status.
- Changes to "Completed" are confirmed by Administration (F2-14).

**Member directory rules**

- **Visible to every verified member:** name, photo, clan, Areas of Service.
- **Share-to-see:** a member who shares sees other sharers' shared fields (full list in M5). A member who keeps theirs private sees no one's.
- **Private by default**, switched on by the member from profile settings or the wizard's last step, with a plain explanation.
- **Enforced on the server:** shared fields are only returned to someone who is sharing.
- Search by name and occupation; filter by Area of Service and clan.
- Leaders' access to contact details follows Section 3.5.

---

### 4.3 Roles, access, clan portal and platform analytics (F3)

**Goal:** every person sees and does exactly what their role allows, enforced on the server. A System Admin can open any door.

#### 4.3.1 Roles and access

| ID | Story | Key rules | Status |
|---|---|---|---|
| F3-01 | As a portal user, I land on the Areas of Service hub showing every department I can open and, if I'm a clan elder, my clan. | Access rules in Section 3.2. Paused departments show "Coming soon". Fixed department icons. | Change |
| F3-02 | As a System Admin, I see every department and clan on the hub and can enter any with the full powers of its head. | **No separate System Admin portal.** The `/system-admin` area is removed. | Change |
| F3-03 | As a System Admin, the Administration portal shows me extra pages: accounts, roles, audit log, platform analytics and cost register. | Moved from `/system-admin`. Suspension removed. Themes move to Pastoral. See A8. | Change |
| F3-04 | As an HOD, I see my own roster, including pending claimants, with full profiles regardless of sharing, and manage it. | Strictly my own department. Today HODs can change but not read their roster. Powers in Section 4.7. | Change |
| F3-05 | As a delegate, I do the routine work listed in Section 4.7 and only see buttons I can use. | Today buttons appear that the backend refuses. | Change |
| F3-06 | As the Administration HOD, I appoint the HOD of any department. | One HOD per department, one HOD role per person, mentorship not required. | Built |
| F3-07 | As a clan elder, I open my clan's portal from the hub. | Today the link is a 404. | New |
| F3-08 | As any user, church content is only available when signed in. | Every content query checks for a signed-in user. | Change |
| F3-09 | As anyone appointing an HOD, the appointment always names a department. | Today the backend accepts an unscoped HOD. | Change |
| F3-10 | As a person whose role is removed, I'm told privately. | | New |
| F3-16 | As a System Admin or the Administration HOD, I appoint a clan elder. | One elder per clan; appointing replaces the sitting elder. | Change |
| F3-19 | As a Media, Hospitality or Library roster member, I open my department's portal without holding a role. | Section 3.2. | New |

#### 4.3.2 Clan portal

**Pages:** Members, Super T, Listening, Messages, Activities.

| ID | Story | Key rules | Status |
|---|---|---|---|
| F3-11 | As a clan elder, I see all my clan's members, verified and pending, with full profiles. | Own clan only. | New |
| F3-12 | As a clan elder, I'm notified when someone joins or moves into my clan. | Push and web bell. | New |
| F3-13 | As a clan elder, I send a message to my whole clan. | Verified clan members receive push and in-app, and find it under "My groups" (M3-03). Sent messages are listed. | New |
| F3-14 | As a clan elder, I assign my clan's members to our Super T gates. | Rules in Section 4.4. | New (depends on Radio) |
| F3-15 | As a clan elder, I see which of my clan members listened to each radio program, and for how long, by name. | In-app listening only (R1-08). | New (depends on Radio) |
| F3-18 | As a clan elder, I create, edit and cancel **clan activities** (gatherings, meetings): title, date, start and end time, location, description. | Verified clan members are notified and reminded, and see them in the app tagged with the clan name. Shown read-only on the Year Planner. | New |

**Deferred:** an elder's spouse sharing the elder's access.

#### 4.3.3 Platform analytics and cost register (System Admin)

| ID | Story | Key rules | Status |
|---|---|---|---|
| F3-17 | As a System Admin, I see platform-wide analytics and running costs. | Content below. | New |

**Counted by the platform itself**

| Section | Numbers |
|---|---|
| People | Total accounts; visitors, pending and verified members; sign-ups per week; account deletions |
| Activity | Active users today, this week, this month (F1-11) |
| Devices | Phones with the app signed in, by Android and iPhone and by app version |
| Engagement | Verifications and send-backs; claims waiting; messages and activities per department; radio listening hours |
| Notifications | Pushes, emails and SMS sent this month; email free allowance used; SMS credit remaining |
| Health | Errors this week with a link to Sentry; file storage used |

**Not automatic in Phase 01**

- **Store downloads:** "phones with the app signed in" is shown instead, with links to the Google Play and App Store consoles.
- **Costs:** a **cost register** kept by the System Admin: each service's plan, cost, billing cycle and renewal date. The page shows total monthly cost, a per-service breakdown and reminders before renewals. Where current usage is easy to show (emails against the free allowance, SMS credit), it appears beside the service.

---

### 4.4 Super T rules

- A **gate** is one hour of prayer on Super T (Tuesday, 24 hours).
- The 12 clans go round **twice** in the **seeded clan order** (tribes of Israel), starting with **Reuben at 6AM Tuesday**. Each clan holds two gates, 12 hours apart. The last gate ends at 6AM Wednesday.
- An elder assigns **at most 2 members per gate**, from their own clan's verified members.
- **Deadline:** Monday at 4PM. **Reminders to elders:** Sunday at 1PM and 8PM. Elders may still assign until the gate starts.
- Assigned members are notified of their exact gate and reminded before it, **including overnight**.
- **Observation:**
  - A gate with nobody assigned is recorded as **not observed** when it ends.
  - A gate with members assigned counts as **observed** if at least one of them shows up.
  - Media marks a gate where no assigned member showed up, recording it as **not observed**; the elder is notified.
- Elders see their clan's observation history; Media and Radio Insights see all clans.
- Super T is **never recorded**.
- The Radio data model (Section 4.9) must be designed before the clan portal's Super T and listening features are built.

---

### 4.5 Notifications (F4)

**Goal:** each notification reaches only the people it concerns, on the right channel, and tapping it always leads somewhere useful.

**Channels:** push (mobile), in-app notification centre (mobile), web bell (portal), email (five events only, Section 4.1), SMS (Hospitality visitors only, Section 4.10). The full list of notifications is in Section 5.

| ID | Story | Key rules | Status |
|---|---|---|---|
| F4-01 | As a user, I'm notified of new church events in my audience and of published announcements. | An announcement notifies only on its **first** publish. | Change |
| F4-02 | As a user, I get reminders before events and programs, never for a cancelled occurrence. | Needs single-occurrence cancellation (A4-02). | Change |
| F4-03 | As a newly appointed HOD, delegate or clan elder, I'm told of my appointment, and so are the people I now lead. | Appointee plus that roster or clan. **Never all users.** | Change |
| F4-04 | As a person whose role is removed, I'm told privately. | | New |
| F4-05 | As an Administration reviewer, I'm alerted when a profile is submitted or resubmitted, or a mentorship completion awaits confirmation. | Push and web bell. | Change |
| F4-06 | As a member, I'm notified when my profile is verified or sent back. | Push, in-app and email; send-back includes the reason. | Change |
| F4-07 | As an HOD, I'm alerted when someone claims my department. | Push and web bell. | New |
| F4-08 | As an HOD or delegate, I send a message to my whole department roster. | Details in S5. | New |
| F4-09 | As a clan member, I receive my elder's messages and activities, and my Super T assignment and reminder. | | New |
| F4-10 | As a portal user, the web bell shows my portal work with unread counts and lets me mark items read. | Profiles and mentorship confirmations awaiting review; department claims; appointments and my role changes; clan joins; activities for my departments; HOD notices; Radio inbox items (Pastoral); follow-up assignments and SMS credit (Hospitality); low stock (Library); giving detail changes (Pastoral HOD, System Admin); cost renewals (System Admin). Not general member content. | New |
| F4-11 | As a user, event, announcement, activity and message notifications show their image. | Always in the in-app centre and web bell; in the push itself where the phone supports it. | Change |
| F4-12 | As a user, tapping a notification about a started event or expired announcement still opens it, marked as ended. | Today it shows "not found". | Change |
| F4-13 | As a user, tapping an appointment or profile notification opens the right place. | Profile notices open My Profile; appointment notices open a screen explaining the role and how to open the web portal. | Change |
| F4-14 | As an HOD or delegate, I create an **activity** for my department. | Details in S4. | New |
| F4-15 | As Administration, I create a church **event** for the whole church, everyone serving in any department, or selected departments. | Details in A5. | Change |
| F4-16 | As a department or clan member, I see my departments' and clan's activities in the app, tagged with their name, alongside church events. | Others don't see them. | New |
| F4-17 | As a department or clan member, I'm notified when an activity is created or changed, and reminded before it. | **Verified members only**, not pending claimants. Push for all; web bell too for portal users. | New |
| F4-18 | As an HOD, delegate or clan elder, I edit or cancel an activity. | Cancellation notifies the same people and stops reminders. | New |
| F4-19 | As a user, I switch off notification categories. | Table below. Muting stops **push only**; items still appear in the in-app centre. | New |
| F4-20 | As an HOD, I send a one-way notice to one HOD, several or all HODs. | No replies inside the system. Push and web bell. The Pastoral HOD and System Admin can also send. | New |
| F4-21 | As a verified member who hasn't completed mentorship, I receive a monthly reminder. | F2-15. | New |

**Overnight rule:** reminders for overnight slots (Super T gates, Tongues of Fire) are delivered overnight, only to the people concerned.

**Mutable categories (F4-19)**

| Category | Can be switched off? |
|---|---|
| New church events | Yes |
| Announcements | Yes |
| Program, event and activity reminders | Yes |
| Radio: live now (per followed program, R1-07) | Yes |
| Department and clan messages and activities (including new leaders for my department or clan) | Yes |
| Mentorship reminders | Yes |
| Prayer request prayed for | Yes |
| My account and profile | No |
| My roles and department membership | No |
| My Super T gate assignment and reminder | No |
| Portal work (web bell items, HOD notices, giving detail changes, low stock, credit and renewal warnings) | No |

---

### 4.6 Mobile member app (M)

**Goal:** every minister opens the app and finds this week's church life in one place, and keeps their own details and notification choices in order without asking anyone.

#### 4.6.1 App structure

| Place | Contents |
|---|---|
| **Home** tab | Church life at a glance (M2) |
| **Radio** tab | Live stream, schedule, recordings, prayer request and testimony (Section 4.9) |
| **Give** tab | Simplified giving (M9) |
| **Updates** tab | Announcements, plus "My groups": messages from my departments and clan |
| **Community** tab | Member directory (M5) |
| Top-bar menu | Events & Programs (including past events), Tower of Faith (including spaces to let), Library, Help & Support |
| Top bar | Bell with unread count; avatar opens My Profile |

**Removed for Phase 01:** the locked Admin tile, Booking, Inquiries, Procurement, Appointments and every other out-of-scope item. Nothing appears locked or dead.

#### 4.6.2 Stories

**M1: App shell**

| ID | Story | Key rules | Status |
|---|---|---|---|
| M1-01 | As a user, I move between Home, Radio, Give, Updates and Community from the tab bar. | Other items in the top-bar menu. | Change |
| M1-02 | As a user, every menu item works. | Out-of-scope items removed, not locked. | Change |
| M1-03 | As a user, the bell shows my unread count and opens my notifications; the avatar opens my profile. | | Built |
| M1-04 | As a user on a poor connection, I see a clear message and a retry button, not a blank screen or crash. | F5-06 | New |

**M2: Home**

| ID | Story | Key rules | Status |
|---|---|---|---|
| M2-01 | As a user, I see the current annual and monthly theme. | Authored by Pastoral (PS1-01). | Built (source changes) |
| M2-02 | As a user, I see the Team Leader's welcome with his photo, and the church's vision and core values. | Authored by Pastoral (PS1-02, PS1-03). | New |
| M2-03 | As a user, I see today's devotional. | Authored by Media (D1). | New |
| M2-04 | As a user, when the radio is live I see a "Live now" card that opens the Radio tab. | Hidden when off air. | New |
| M2-05 | As a user, I see this week's programs; a cancelled occurrence shows as cancelled. | F4-02 | Change |
| M2-06 | As a user, I see upcoming and featured church events plus my departments' and clan's activities, tagged. | F4-16 | Change |
| M2-07 | As a visitor, I see my membership status: become a member, pending review, or sent back with the reason and an "Edit and resubmit" button. | | Change |
| M2-08 | As a user, empty sections don't appear. | | Built |
| M2-09 | As a verified member who hasn't completed mentorship, I see a gentle "Complete your mentorship" banner. | F2-15 | New |

**M3: Updates**

| ID | Story | Key rules | Status |
|---|---|---|---|
| M3-01 | As a user, I read active announcements, with high-priority ones pinned. | | Built |
| M3-02 | As a user, I see each announcement's category. | Stored today, not shown. | Change |
| M3-03 | As a user, I find messages from my departments and clan under "My groups", even after the notification is cleared. | Deleted messages disappear (S5-03). | New |
| M3-04 | As a user, an expired announcement opened from a link shows as ended. | F4-12 | Change |

**M4: Events & Programs**

| ID | Story | Key rules | Status |
|---|---|---|---|
| M4-01 | As a user, I see upcoming church events and my departments' and clan's activities, each tagged. | | Change |
| M4-02 | As a user, event and activity details show date, start and end time, location and description; cancelled items are marked. | | Change |
| M4-03 | As a user, I browse weekly programs and see cancelled occurrences. | | Change |
| M4-04 | As a user, I add an event or activity to my phone's calendar. | | New |
| M4-05 | As a user, I browse past events as YouTube thumbnails and open them in YouTube. | P1-02 | New |

**M5: Community (member directory)**

**Field visibility**

| Field | Seen by (in the directory) |
|---|---|
| Name, photo, clan, Areas of Service | All verified members |
| Phone, WhatsApp, email | Other sharing members |
| Occupation, industry, employer, skills | Other sharing members |
| Short bio | Other sharing members |
| Birthday (day and month only) | Other sharing members |
| Home address; year of birth; marital status; spouse; children; next of kin; mentorship and leadership progress | Nobody in the directory |

| ID | Story | Key rules | Status |
|---|---|---|---|
| M5-01 | As a member, I browse verified members with name, photo, clan and Areas of Service. | Real data replaces the placeholder list. | Change |
| M5-02 | As a member, I search by name or occupation and filter by Area of Service and clan. | | Change |
| M5-03 | As a sharing member, I open another sharer's card and call, WhatsApp or email them in one tap. | Only fields in the table. | New |
| M5-04 | As a private member, I see a note that sharing unlocks others' details, with a button to turn sharing on. | | New |
| M5-05 | As a visitor, opening Community invites me to complete my profile. | | Built |

**M6: My Profile**

| ID | Story | Key rules | Status |
|---|---|---|---|
| M6-01 | As a user, I view my full profile, including my real mentorship status. | F2-11 | Change |
| M6-02 | As a user, I edit my details and photo. | F2-03, F2-06 to F2-08. A change to mentorship "Completed" shows "Awaiting confirmation" (F2-14). | New |
| M6-03 | As a user, I see my departments, pending claims, clan (or "to be assigned") and any roles. | Role holders and Media, Hospitality and Library members see a pointer to the web portal. | New |
| M6-04 | As a user, I switch directory sharing on or off. | | New |
| M6-05 | As a user, I choose which notification categories I receive and which radio programs I follow. | F4-19, R1-07 | New |
| M6-06 | As a user, I change my password, sign out, or delete my account. | F1-04, F1-06, F1-08 | Change |
| M6-07 | As a user, I reach Help & Support. | Contacts Andrew (F5-11). | New |

**M7: Tower of Faith**

| ID | Story | Key rules | Status |
|---|---|---|---|
| M7-01 | As a user, I browse the building floor by floor and see each facility's photos, description, responsible person and opening hours, with "Open now" or "Closed". | Maintained by Real Estate (RE1). | New |
| M7-02 | As a user, I contact a facility by call or WhatsApp in one tap. | | New |
| M7-03 | As a user, I browse spaces to let with photos and details, and contact Real Estate in one tap. | RE2 | New |

**M8: Role holders on mobile**

| ID | Story | Key rules | Status |
|---|---|---|---|
| M8-01 | As someone just appointed, tapping the notice opens a screen explaining my role and how to open the web portal. | F4-13 | New |
| M8-02 | As a member assigned to a Super T gate, I see my gate time and am reminded before it. | Section 4.4 | New |

**M9: Give**

**Principle:** the app guides the member to pay **outside** it. **No payments, amounts or giving activity are recorded or counted.**

| ID | Story | Key rules | Status |
|---|---|---|---|
| M9-01 | As a user, I choose what I'm giving towards. | Categories maintained by Finance (FN1-01). | Change |
| M9-02 | As a user, I choose a payment method: MTN Mobile Money, Airtel Money, or a bank such as Absa. | Only active methods (FN1-06). | Change |
| M9-03 | As a user paying by bank, I copy the account name, number, branch and a ready-made reference, each in one tap. | Reference format CATEGORY-SURNAME (FN1-05). | New |
| M9-04 | As an Android user paying by mobile money, I enter an amount and the dialer opens with the full code ready; I press call and enter my PIN. | Code built from Finance's pattern and pay number. The member chooses the SIM on dual-SIM phones. | New |
| M9-05 | As an iPhone user paying by mobile money, I copy the full code and paste it into my Phone app. | iPhone blocks pre-filled codes with `*` or `#`. | New |
| M9-06 | As a user, before paying I see the recipient name MTN or Airtel will show. | So I know I'm paying the church. | New |
| M9-07 | As a user, after starting a payment I see honest guidance: complete it on your phone and expect the network's confirmation message. | No false "gift received". Fake transaction history removed. | Change |
| M9-08 | As a user, if no payment method is active, Give explains that giving details are being updated. | | New |

**Known limits:** mobile money gifts reach the church without their category; the flow is described in App Store review notes; codes are tested on real MTN and Airtel SIMs before the pilot.

**M10: Library**

| ID | Story | Key rules | Status |
|---|---|---|---|
| M10-01 | As a user, I browse the Library catalogue and read or play free content. | L1-05, L1-06, L2-02 | New |

---

### 4.7 Shared department shell (S)

**Goal:** every in-scope department gets a working home on the web portal. Its leaders can see who serves with them, confirm new people, message the team and schedule activities. Each department then adds its own pages (Sections 4.9 to 4.14). Administration keeps its own pages (4.8), which cover the same ground.

#### 4.7.1 Pages

| Page | Contents |
|---|---|
| **Dashboard** | Only what relates to this department: verified member count, claims waiting, members without completed mentorship, upcoming activities, recent activity feed, the church's weekly programs, plus department-specific cards |
| **Roster** | Everyone serving, with position and mentorship status; pending claimants in a separate, marked section |
| **Activities** | The department's activities as a list and month calendar, plus church events the department is part of (read-only) |
| **Messages** | Message the department; past messages; notices to and from other HODs (HOD only) |
| **Settings** | Department description (HOD only); my own profile and account |

Each department is represented by a **fixed built-in icon**.

#### 4.7.2 HOD and delegate powers

| Action | HOD | Delegate |
|---|---|---|
| View roster, full profiles, pending claimants | Yes | Yes |
| Add a verified member from the pool | Yes | Yes |
| Create, edit and cancel department activities | Yes | Yes |
| Send and view department messages | Yes | Yes |
| Delete a department message | Any | Only their own |
| Confirm or decline claims | Yes | No |
| Set positions (free text) | Yes | No |
| Remove someone from the roster | Yes | No |
| Appoint or remove delegates | Yes | No |
| Edit the department description | Yes | No |
| Send notices to other HODs | Yes | No |

Roster members of Media, Hospitality and Library have additional portal access defined in their sections; they never get the HOD-only or delegate powers above unless appointed.

#### 4.7.3 Stories

**S1: Getting in**

| ID | Story | Key rules | Status |
|---|---|---|---|
| S1-01 | As a portal user, I pick my department from the hub and land on its Dashboard. | F3-01 | Change |
| S1-02 | As someone serving in several departments, I switch between them without signing in again. | | Built |
| S1-03 | As a portal user, I only see the pages and buttons my role allows. | Enforced on the server. | Change |
| S1-04 | As a portal user on a phone's browser, every page works on a small screen. | Tables become cards on narrow screens. | New |

**S2: Dashboard**

| ID | Story | Key rules | Status |
|---|---|---|---|
| S2-01 | As an HOD, I see my verified member count and claims waiting. | Pending claimants not counted (F2-10). | New |
| S2-02 | As an HOD, I see upcoming activities and the church's weekly programs. | | New |
| S2-03 | As an HOD, I see recent department activity: people added or removed, claims decided, messages sent, activities created. | From the activity log, filtered to my department. | New |
| S2-04 | As an HOD, I see how many roster members haven't completed mentorship. | Informational. | New |

**S3: Roster**

| ID | Story | Key rules | Status |
|---|---|---|---|
| S3-01 | As an HOD or delegate, I see everyone serving with photo, name, clan, position and mentorship status. | | New |
| S3-02 | As an HOD or delegate, I open any roster member's full profile. | Regardless of sharing. | New |
| S3-03 | As an HOD or delegate, I search and filter by name, clan and position. | | New |
| S3-04 | As an HOD or delegate, I see pending claimants marked "not yet verified" or "awaiting confirmation". | | New |
| S3-05 | As an HOD, I confirm a claim; the person joins my roster and is notified. | Must be verified (the button explains otherwise). Mentorship not required. Three-department cap. | Change |
| S3-06 | As an HOD, I decline a claim with an optional reason; the person is notified. | The claim disappears from their profile. | New |
| S3-07 | As an HOD or delegate, I add a verified member directly from the member pool. | Three-department cap; they're notified. | Built (read side New) |
| S3-08 | As an HOD, I set a roster member's position (free text). | | Built |
| S3-09 | As an HOD, I remove someone from my roster. | Any role they hold there is removed at once; they're told privately; logged. | Built |
| S3-10 | As an HOD, I appoint or remove a delegate. | Verified roster members only. | Built |

**S4: Activities**

| ID | Story | Key rules | Status |
|---|---|---|---|
| S4-01 | As an HOD or delegate, I create an activity: title, date, start and end time, location, description, optional image. | Verified roster members notified and reminded (F4-17). | New |
| S4-02 | As an HOD or delegate, I edit or cancel an activity. | Members notified; reminders move or stop. | New |
| S4-03 | As an HOD or delegate, I see church events my department is part of, read-only. | | New |
| S4-04 | As an HOD or delegate, I see activities on a month calendar. | Also shown read-only on Administration's Year Planner. | New |

**S5: Messages and notices**

| ID | Story | Key rules | Status |
|---|---|---|---|
| S5-01 | As an HOD or delegate, I message my whole department, with an optional image. | Verified roster members; push, in-app and "My groups". | New |
| S5-02 | As an HOD or delegate, I see past messages with sender and time. | | New |
| S5-03 | As an HOD, I delete any department message; a delegate deletes only their own. | Removed from "My groups"; delivered pushes can't be recalled. | New |
| S5-04 | As an HOD, I send a one-way notice to one, several or all HODs. | F4-20 | New |
| S5-05 | As an HOD, I see notices received and sent. | | New |

**S6: Department description**

| ID | Story | Key rules | Status |
|---|---|---|---|
| S6-01 | As an HOD, I write a short description of my department. | Plain text. | New |
| S6-02 | As a member choosing Areas of Service, I see each department's icon and description. | Paused departments marked "Coming soon". | New |

**Deferred shell features:** inventory, yearly activities planner with assigned people, sub-sections, audio meetings, periodic reports, requisitions, messages to the whole church.

---

### 4.8 Administration (A)

**Goal:** the Administration team runs the church's shared life from one place: admitting members, keeping the weekly program and church calendar right, publishing events and announcements, appointing leaders, and seeing the whole church at a glance. The System Admin's tools live here too.

#### 4.8.1 Permissions

| Action | Admin. HOD | Admin. delegate | System Admin |
|---|---|---|---|
| Dashboard; members directory with contact details; all department rosters | Yes | Yes | Yes |
| Verify, send back, confirm mentorship | Yes | Yes | Yes |
| Weekly program, events, announcements, year planner | Yes | Yes | Yes |
| Add to the Administration roster | Yes | Yes | Yes |
| Remove, set positions, appoint Administration delegates | Yes | No | Yes |
| Appoint any department's HOD | Yes | No | Yes |
| Appoint clan elders | Yes | No | Yes |
| Accounts, roles, audit log, platform analytics, cost register | No | No | Yes |

#### 4.8.2 Pages

| Group | Page | Phase 01 change |
|---|---|---|
| Overview | Dashboard | Fix the recent-activity card |
| Membership | Verification queue | Send-back, resubmission marking, mentorship confirmations |
| | Members directory | Contact details; mentorship filter |
| | Roster (Administration's own) | Mostly built |
| | Departments | Added to the sidebar |
| | Clans | New |
| Programs & content | Weekly program | Single-occurrence cancel and restore |
| | Events | Start and end times, audiences, cancel |
| | Announcements | First-publish push only; category shown in the app; whole church only |
| Planning | Year planner | Delete planned activities; all department and clan activities read-only |
| System Admin only | Accounts, Roles, Audit log, Platform analytics | Moved from `/system-admin`; analytics and cost register new |

#### 4.8.3 Stories

**A1: Dashboard**

| ID | Story | Key rules | Status |
|---|---|---|---|
| A1-01 | As Administration, I see pending work: profiles to verify, send-backs awaiting resubmission, mentorship confirmations, claims waiting across departments. | | Change |
| A1-02 | As Administration, I see membership analytics with filters and CSV export. | | Built |
| A1-03 | As Administration, I see recent church activity. | Today uses a System Admin-only query and errors for others (as-built map issue I-1). Non-System Admins see church activity only. | Change: bug |
| A1-04 | As Administration, I see this week's programs and upcoming events and activities. | | Change |

**A2: Verification and mentorship**

| ID | Story | Key rules | Status |
|---|---|---|---|
| A2-01 | As Administration, I review pending profiles in a list or one at a time, correct fields and verify. | | Built |
| A2-02 | As Administration, I send a profile back with a written reason. | F2-05 | New |
| A2-03 | As Administration, I see resubmitted profiles marked "Resubmitted", with my earlier reason. | | New |
| A2-04 | As Administration, I confirm or reject a change of mentorship status to "Completed". | F2-14. Member notified; optional note on rejection. | New |
| A2-05 | As Administration, the reviewer name members see is "the Administration team" everywhere. | | Change |

**A3: Members, rosters and leaders**

| ID | Story | Key rules | Status |
|---|---|---|---|
| A3-01 | As Administration, I search and filter verified members by sex, marital status, clan, department and mentorship status, open a detail sheet with contact details, and export CSV. | Age stays out of the table. | Change |
| A3-02 | As Administration, I manage Administration's own roster. | Shell rules. | Built |
| A3-03 | As Administration, I open any department's roster from the sidebar, including pending claimants. | Today URL-only. | Change |
| A3-04 | As the Administration HOD, I appoint or replace any department's HOD. | F3-09, F4-03 | Change |
| A3-05 | As the Administration HOD, I see the 12 clans with their elders and appoint or replace an elder. | F3-16 | New |
| A3-06 | As the Administration HOD, I see which departments and clans have no leader. | | New |

**A4: Weekly program**

| ID | Story | Key rules | Status |
|---|---|---|---|
| A4-01 | As Administration, I create, edit and switch off recurring programs (once, weekly, fortnightly, monthly). | | Built |
| A4-02 | As Administration, I cancel a single occurrence with an optional reason. | Shown as cancelled; no reminder; option to notify members. | New |
| A4-03 | As Administration, I restore a cancelled occurrence. | | New |

**A5: Events**

| ID | Story | Key rules | Status |
|---|---|---|---|
| A5-01 | As Administration, I create an event with title, date, start and end time, location, description, cover image and featured flag. | End after start. | Change |
| A5-02 | As Administration, I choose the audience: whole church, everyone serving in any department, or selected departments. | Only the audience is notified, reminded and sees it. No clan audience. | Change |
| A5-03 | As Administration, I edit an event and reminders move with it. | | Built |
| A5-04 | As Administration, I cancel an event; the audience is notified. | Stays visible marked "Cancelled". | New |
| A5-05 | As Administration, I archive or restore an event. | | Built |

**A6: Announcements**

| ID | Story | Key rules | Status |
|---|---|---|---|
| A6-01 | As Administration, I draft, publish, disable and archive announcements with priority, category, links, cover and display window. | Whole church only. Administration is the only publisher; other departments ask Administration. | Built |
| A6-02 | As Administration, publishing notifies members only the first time. | | Change |
| A6-03 | As Administration, the category shows in the app. | M3-02 | Change |

**A7: Year planner**

| ID | Story | Key rules | Status |
|---|---|---|---|
| A7-01 | As Administration, I see the year, quarter, month or week with programs, events, planned activities, and every department's and clan's activities. | Department and clan activities are view-only and labelled. | Change |
| A7-02 | As Administration, I create and edit planned activities tagged with departments and a status. | Never shown to members. | Built |
| A7-03 | As Administration, I delete a planned activity. | Confirmation; logged. | New |

**A8: System Admin pages**

| ID | Story | Key rules | Status |
|---|---|---|---|
| A8-01 | As a System Admin, I list, search and filter all accounts and open any account's profile, roles and recent actions. | Suspension removed. | Change (moved) |
| A8-02 | As a System Admin, I grant or revoke System Admin and revoke any role with a note. | Person told privately. | Change (moved) |
| A8-03 | As a System Admin, I browse the full audit log with filters. | | Built (moved) |
| A8-04 | As a System Admin, I see platform analytics. | F3-17 | New |
| A8-05 | As a System Admin, I maintain the cost register and am reminded before renewals. | Push and web bell. | New |

**Deferred:** the monthly HOD summary on the 1st of each month.

---

### 4.9 Media (R, RC, RI, D, P, ST)

**Goal:** members listen to Reign Radio live in the app, know what's on and what's next, read the day's devotional and catch up on recordings and past events. The Media team runs this from its portal, including Super T and listening records.

#### 4.9.1 Principles

- **Caster FM** carries the raw stream. Starting and stopping broadcasts happens outside the platform.
- Built in the platform: listening tracking, live/off-air/interrupted status (automatic with manual override), what's on now, the Radio inbox and Radio Insights.
- A **broadcast schedule owned by Media**, separate from Administration's weekly program.
- Only **in-app** listening is counted. All figures are labelled "in-app listeners".
- Every in-app listener is signed in; visitors without a profile appear as "Unknown" in breakdowns.

#### 4.9.2 Permissions

| Action | Media HOD | Media delegate | Media roster member |
|---|---|---|---|
| Radio, Radio inbox, Super T, Recordings, Devotionals, Past events | Yes | Yes | Yes |
| Radio Insights and PDF reports | Yes | Yes | Yes |
| Department activities and messages | Yes | Yes | Receive only |
| Roster, claims, positions, delegates | Shell | Shell | No |

Radio Insights are also available to the **Pastoral HOD and delegates** and the **System Admin**. Clan elders see listening for their own clan members only, by name (F3-15).

#### 4.9.3 Pages

| Page | Contents |
|---|---|
| Radio | Live status and override; broadcast schedule; listeners right now |
| Radio inbox | Prayer requests and testimonies (shared with Pastoral, PS2) |
| Radio Insights | Analytics and PDF reports |
| Super T | This week's 24 gates, assignments, not-observed marking, history |
| Recordings | Upload recordings for chosen broadcasts |
| Devotionals | Write and schedule daily devotionals |
| Past events | YouTube links |

**Dashboard cards:** live status; today's devotional (warning if tomorrow has none); Super T gates still empty; listeners in the last broadcast.

#### 4.9.4 Stories

**R1: Radio for members (mobile)**

| ID | Story | Key rules | Status |
|---|---|---|---|
| R1-01 | As a user, I play the live stream from the Radio tab. | Replaces the static screen, fake listener count and fake chat. | Change |
| R1-02 | As a user, the radio keeps playing when I switch tabs, lock the phone or open another app. | Background playback with lock-screen controls. | New |
| R1-03 | As a user, I see what's on now (program and host) and what's next, with a countdown. | | New |
| R1-04 | As a user, I see Live, Off air or Stream interrupted. | Automatic; Media's override wins. | New |
| R1-05 | As a user, I browse this week's broadcast schedule. | | Change |
| R1-06 | As a user, I play past recordings by program and date. | | New |
| R1-07 | As a user, I choose programs to follow and get a push when one goes live. | Defaults: Sunday services and Midweek Service on; all others including Super T gates off. | New |
| R1-08 | As a user, my listening time is recorded against the broadcast live while I listened. | Live in-app stream only. | New |
| R1-09 | As a user, I send an **anonymous prayer request** or a **named testimony** from the Radio tab. | Delivered to the Radio inbox (PS2). | New |

**R2: Radio for the Media team**

| ID | Story | Key rules | Status |
|---|---|---|---|
| R2-01 | As Media, I maintain the broadcast schedule: recurring programs (day, start and end, host, description) and one-off broadcasts. | Seeded with Morning Glory (Mon, Wed, Thu, Fri 6 to 7AM), Super T (Tue 24 hours from 6AM), Midweek Service (Wed about 4PM), Tongues of Fire (Fri 11PM to 2AM), Holy Ghost Night (occasional Fri), Early Riser (Sun 4 to 8AM), English Service (Sun 8 to 10:30AM), Luganda Service (Sun 10:30AM to 1PM). | New |
| R2-02 | As Media, when scheduling I pick an existing program or type a one-off name. | One-offs don't become permanent programs. | New |
| R2-03 | As Media, I adjust or cancel a single broadcast. | Members see the change; follow pushes adjust. | New |
| R2-04 | As Media, I set the host as a registered member or a typed guest name. | | New |
| R2-05 | As Media, I force "Live" or "Off air" and return to automatic. | Logged. | New |
| R2-06 | As Media, I see how many are listening in the app right now. | Updates every few seconds. | New |

**RC1: Recordings**

| ID | Story | Key rules | Status |
|---|---|---|---|
| RC1-01 | As Media, I choose which broadcasts are recorded. | **Super T is never recorded.** | New |
| RC1-02 | As Media, I upload a recording to a finished broadcast. | Stored on Cloudflare R2. Recommended export setting shown (spoken-word, about 30 MB per hour). Background, resumable uploads. | New |
| RC1-03 | As Media, I replace or remove a recording. | Logged. Kept until removed; no automatic expiry. | New |
| RC1-04 | As a user, recordings appear in the Radio tab once uploaded. | | New |

**RI1: Radio Insights**

**Filters (apply to every section):** date range, program, clan, gender, age group, department, membership status.

| ID | Story | Key rules | Status |
|---|---|---|---|
| RI1-01 | As an insights viewer, I see listeners in the app right now and the program on air. | | New |
| RI1-02 | As an insights viewer, I see total listening hours, unique listeners, average time per listener and change against the previous period. | | New |
| RI1-03 | As an insights viewer, I see programs ranked by listening hours and unique listeners. | | New |
| RI1-04 | As an insights viewer, I see listening hours by clan, gender, age group and department. | | New |
| RI1-05 | As an insights viewer, I see listening over time and a heatmap of busiest days and hours. | | New |
| RI1-06 | As an insights viewer, I see Super T observation by clan and listening during each clan's gates. | | New |
| RI1-07 | As an insights viewer, I see a world map of listening totals per city. | Approximate location from the device's internet connection; no permission prompt; **city totals only, never an individual's location**. Exact source confirmed during build. | New |
| RI1-08 | As an insights viewer, I export a **PDF report** of what the filters show, including the charts, in the system's theme. | Filters and dates printed on the report. | New |
| RI1-09 | As an insights viewer, I see totals and breakdowns only, never named individuals. | | New |

**D1: Devotionals**

| ID | Story | Key rules | Status |
|---|---|---|---|
| D1-01 | As Media, I write a devotional: title, scripture reference, text, date. | One per date. | New |
| D1-02 | As Media, I schedule ahead and see which upcoming days have none. | Dashboard warns if tomorrow is empty. | New |
| D1-03 | As a user, I read today's devotional on Home and browse recent ones. | | New |
| D1-04 | As Media, I edit a devotional before or after its date. | | New |

**P1: Past events**

| ID | Story | Key rules | Status |
|---|---|---|---|
| P1-01 | As Media, I add a past event with title, date and YouTube link. | Thumbnail shown automatically. | New |
| P1-02 | As a user, I browse past events as thumbnails; tapping opens YouTube. | M4-05 | New |
| P1-03 | As Media, I edit or remove a past event. | | New |

**ST1: Super T (Media side)**

| ID | Story | Key rules | Status |
|---|---|---|---|
| ST1-01 | As Media, I see this week's 24 gates in order with clan and assigned members. | Section 4.4 | New |
| ST1-02 | As Media, I see gates still empty after the Monday 4PM deadline. | Recorded as not observed when the gate ends. | New |
| ST1-03 | As Media, I mark a gate where no assigned member showed up. | Not observed; the elder is notified. | New |
| ST1-04 | As Media, I see phone numbers of members assigned to this week's gates only. | | New |
| ST1-05 | As Media, I see observation history by week and clan. | | New |

**Deferred:** public live chat, quick praise messages, visible listener list, personal notes during broadcasts, aggregated social media feed.

---

### 4.10 Hospitality (H)

**Goal:** nobody who visits KLT slips through the cracks. Hospitality records every visitor, thanks and follows up with first-timers, encourages regulars toward membership, and places members without a clan.

#### 4.10.1 Principles

- Two kinds of visitor in one list: **app visitors** (accounts) and **walk-in visitors** (records kept by Hospitality).
- Visitors with smartphones are always encouraged to download the app and sign up themselves.
- A walk-in who later signs up is joined to their account (suggested on matching phone number, confirmed by Hospitality).
- **Consent is mandatory** before saving a walk-in's phone number; it can be withdrawn.
- A **regular visitor** has at least **3 visits within a calendar month**.
- Visits are recorded by hand; there is no check-in system.
- SMS via **Africa's Talking**; email stays limited to the five system events.

#### 4.10.2 Permissions

| Action | HOD | Delegate | Roster member |
|---|---|---|---|
| Visitors, follow-ups, SMS, clan placement, reports | Yes | Yes | Yes |
| Edit message templates | Yes | No | No |
| Department activities and messages | Yes | Yes | Receive only |
| Roster, claims, positions, delegates | Shell | Shell | No |

#### 4.10.3 Pages

| Page | Contents |
|---|---|
| Visitors | Both kinds, first-timers and regulars flagged; add walk-in; record visit |
| Follow-ups | Outstanding and done; outcomes; assignments |
| SMS | Send to one or many from templates; history with delivery status; credit |
| Clan placement | Verified members without a clan; clan sizes; assign |
| Reports | Visitors, follow-ups and SMS by date range; PDF |

**Dashboard cards:** visitors this month, first-timers this week, returning and regular visitors, follow-ups outstanding, members waiting for a clan, clan sizes, SMS credit.

#### 4.10.4 Stories

**H1: Visitors**

| ID | Story | Key rules | Status |
|---|---|---|---|
| H1-01 | As Hospitality, I add a walk-in from my phone: name, phone, gender, age group, visit date, invited by, notes, and consent. | Name and date required. A phone number cannot be saved without the consent tick. | New |
| H1-02 | As Hospitality, I send a visitor with a smartphone the app link by SMS or WhatsApp in one tap. | They sign up and appear as an app visitor. | New |
| H1-03 | As Hospitality, I see walk-in and app visitors in one list, first-timers and regulars flagged. | App visitors appear automatically at sign-up. | New |
| H1-04 | As Hospitality, I record a return visit for any visitor. | | New |
| H1-05 | As Hospitality, I search and filter by first visit, visits, gender, age group, follow-up and regular status. | | New |
| H1-06 | As Hospitality, I open a visitor's record to edit it and see visit, follow-up and SMS history. | | New |
| H1-07 | As Hospitality, I join a walk-in record to an app account. | Suggested on phone match; confirmed by Hospitality. | New |
| H1-08 | As Hospitality, I remove a walk-in's record or their consent on request. | Withdrawal stops SMS and hides call and WhatsApp buttons. Logged. | New |

**H2: Follow-ups**

| ID | Story | Key rules | Status |
|---|---|---|---|
| H2-01 | As Hospitality, every first-time visitor lands on the follow-up list. | | New |
| H2-02 | As Hospitality, I call, WhatsApp or SMS a visitor in one tap, pre-filled from a template. | Consent required. | New |
| H2-03 | As Hospitality, I record the outcome: reached, no answer, wrong number, asked not to be contacted, with a note. | "No answer" stays open. "Asked not to be contacted" withdraws consent. | New |
| H2-04 | As Hospitality, I assign a follow-up to a team member. | They're notified. | New |
| H2-05 | As Hospitality, I send an in-app message to app visitors. | | New |

**H3: SMS**

| ID | Story | Key rules | Status |
|---|---|---|---|
| H3-01 | As Hospitality, I send an SMS to one visitor or a selected group. | Consenting visitors only; cost estimate shown before sending. | New |
| H3-02 | As the HOD, I maintain SMS templates with placeholders for name, visit date and next service. | Character counter shows SMS parts. | New |
| H3-03 | As Hospitality, I see SMS history with delivery status. | Africa's Talking delivery reports. | New |
| H3-04 | As Hospitality, I see remaining credit; the HOD is warned when it runs low. | Topped up by Church Finance outside the platform. | New |
| H3-05 | As a consenting first-time walk-in, I receive an automatic thank-you SMS the evening after my visit. | From the thank-you template. | New |

**H4: Toward membership**

| ID | Story | Key rules | Status |
|---|---|---|---|
| H4-01 | As Hospitality, I see regular visitors highlighted. | | New |
| H4-02 | As Hospitality, I send a regular walk-in the app link by SMS or WhatsApp. | | New |
| H4-03 | As Hospitality, I see app visitors who haven't started or finished their member profile. | | New |

**H5: Clan placement**

| ID | Story | Key rules | Status |
|---|---|---|---|
| H5-01 | As a member, the wizard offers my clan or "I don't know my clan". | F2-01 | Change |
| H5-02 | As Hospitality, I see verified members with no clan, oldest first. | Unassigned members only; members who chose a clan are never moved by Hospitality. | New |
| H5-03 | As Hospitality, I see clan sizes while choosing; the smallest are highlighted. | | New |
| H5-04 | As Hospitality, I assign a member to a clan; the member and elder are notified. | Logged. | New |

**H6: Reports**

| ID | Story | Key rules | Status |
|---|---|---|---|
| H6-01 | As Hospitality, I see visitors over time, first-timers against returning, regulars, follow-up completion and SMS sent. | Date range filter. | New |
| H6-02 | As Hospitality, I export a PDF report of what the filters show. | Same style as the Radio Insights report. | New |

**Deferred:** requisitions, check-in system, SMS to members.

---

### 4.11 Finance (FN)

**Goal:** members give easily and safely through the app, and Finance keeps giving details accurate. A wrong number or tampered account must never quietly send members' money to the wrong place.

#### 4.11.1 Principles

- Giving happens **outside** the app; nothing about giving is recorded or counted (M9).
- Giving details are editable data owned by Finance.
- The giving categories are entered by Finance during setup.

#### 4.11.2 Permissions

| Action | Finance HOD | Finance delegate |
|---|---|---|
| Manage categories and descriptions | Yes | Yes |
| Change payment details (account numbers, branches, dial-code patterns, pay numbers, recipient names) | **Yes** | **No** |
| Switch a payment method on or off; set reference format | Yes | No |
| View giving settings and change history | Yes | Yes |

The System Admin can switch a payment method **off** in an emergency but cannot edit its details. Ordinary Finance roster members have no portal access.

#### 4.11.3 Pages

| Page | Contents |
|---|---|
| Giving settings | Categories, bank methods, MTN and Airtel methods, reference format |
| Change history | Every change: who, when, old and new values |

**Dashboard:** active categories and methods, and when each was last changed.

#### 4.11.4 Stories

| ID | Story | Key rules | Status |
|---|---|---|---|
| FN1-01 | As Finance, I add, rename, reorder and switch off categories, each with an optional description. | Switched-off categories leave the app but stay in history. | New |
| FN1-02 | As the Finance HOD, I manage bank methods: bank, account name, number, branch, optional note. | | New |
| FN1-03 | As the Finance HOD, I manage MTN and Airtel methods: dial-code pattern, merchant or pay number, recipient name. | | New |
| FN1-04 | As the Finance HOD, before saving a mobile money method I see the exact code members will get for a sample amount. | | New |
| FN1-05 | As the Finance HOD, I set the bank reference format (default CATEGORY-SURNAME). | | New |
| FN1-06 | As the Finance HOD, I switch a payment method off temporarily. | M9-08 when none active. | New |
| FN2-01 | As the church, only the Finance HOD can change payment details. | Server-enforced. | New |
| FN2-02 | As the church, every change to payment details or method status notifies the **Pastoral HOD and System Admin** immediately, showing what changed. | Push and web bell; cannot be muted. | New |
| FN2-03 | As Finance, I see the full change history. | Cannot be edited or deleted. | New |

**Deferred:** income recording, requisitions, budgets, cash capture, giving statements, expense categories, vendors, marketplace, payment tracking, financial reports, usage statistics.

---

### 4.12 Pastoral (PS)

**Goal:** the Pastoral team leads the church's spiritual voice in the app and keeps sight of the whole church, without doing Administration's work.

#### 4.12.1 Principles

- The Pastoral HOD is ideally the **Team Leader**, who appoints **pastors as delegates**. Portal limited to HOD and delegates.
- Views of other departments, clans and members are **read-only**, including contact details.
- Pastoral does not publish announcements; it sends a notice to Administration.
- **Prayer requests are always anonymous. Testimonies carry the member's name.**

#### 4.12.2 Permissions

| Action | Pastoral HOD | Pastoral delegate |
|---|---|---|
| Home content (themes, welcome, photo, vision, core values) | Yes | Yes |
| Radio inbox | Yes | Yes |
| Church overview, rosters, clan lists, analytics (read-only, with contact details) | Yes | Yes |
| Radio Insights and PDF report | Yes | Yes |
| Notices to HODs | Yes | No |

#### 4.12.3 Pages

| Page | Contents |
|---|---|
| Home content | Themes; Team Leader's welcome and photo; vision; core values |
| Radio inbox | Prayer requests and testimonies, live during broadcasts (shared with Media) |
| Church overview | Every department and clan, read-only |
| Radio Insights | As in Section 4.9 |

**Dashboard cards:** new prayer requests and testimonies, current themes (warning when next month has none), departments and clans without leaders, membership totals, last week's listening.

#### 4.12.4 Stories

| ID | Story | Key rules | Status |
|---|---|---|---|
| PS1-01 | As Pastoral, I set annual and monthly themes with title, scripture and date range, ahead of time. | Moved from `/system-admin`. Warning when next month has none. | Change |
| PS1-02 | As Pastoral, I edit the Team Leader's welcome message and photo. | M2-02 | New |
| PS1-03 | As Pastoral, I edit the vision and core values. | | New |
| PS2-01 | As a member, my prayer request is anonymous to everyone. | The system keeps the link privately only to send PS2-05. | New |
| PS2-02 | As a member, my testimony is sent with my name so it can be read on air. | | New |
| PS2-03 | As Pastoral and Media, I see prayer requests and testimonies arrive live in the Radio inbox, grouped by the broadcast they came in during. | Push and web bell to Pastoral for items outside broadcasts. | New |
| PS2-04 | As Pastoral or Media, I mark a testimony read on air and a prayer request prayed for. | Shows who and when. | New |
| PS2-05 | As a member, I'm told when my prayer request has been prayed for. | "The pastoral team has prayed for your request." Mutable. | New |
| PS2-06 | As Pastoral, I hide an inappropriate submission. | Hidden for everyone; logged. | New |
| PS3-01 | As Pastoral, I see every department (HOD, delegates, count) and clan (elder, count). | | New |
| PS3-02 | As Pastoral, I open any roster or clan list read-only, with contact details. | | New |
| PS3-03 | As Pastoral, I see membership totals and trends. | Administration analytics, read-only. | New |
| PS3-04 | As Pastoral, I see Radio Insights and export the PDF. | | New |
| PS4-01 | As the Pastoral HOD, I send notices to HODs, including Administration for church announcements. | F4-20 | New |

**Deferred:** requisition and budget oversight, approvals, task tracker, queries to departments, meeting organisation, governance reporting, publishing to the church.

---

### 4.13 Library & Information (L)

**Goal:** members browse the church's books, flash disk packages and merchandise, use free material in the app, and know how to get items from the Library desk.

#### 4.13.1 Principles

- No payments or sales records in the app; items are bought at the Library desk.
- **No paid digital content** in Phase 01.
- Sermons belong to Media.
- The catalogue includes **merchandise** (branded cups, pens, notebooks and similar).

#### 4.13.2 Permissions

Every Library roster member has the **same operational access** (catalogue, free content, stock). The HOD also keeps the shell powers and the contact settings.

#### 4.13.3 Pages

| Page | Contents |
|---|---|
| Catalogue | Books, flash disk packages, teaching materials, manuals, merchandise |
| Free content | PDFs and audio |
| Stock | Quantities, movements, low-stock alerts |

**Dashboard cards:** total items, low-stock items, recent additions, free content highlights.

#### 4.13.4 Stories

| ID | Story | Key rules | Status |
|---|---|---|---|
| L1-01 | As Library, I add an item: title, description, category, author or minister, cover, type (book, flash disk package, teaching material, manual, merchandise), price, availability. | Categories editable. | New |
| L1-02 | As Library, I create a flash disk package listing its contents, price and cover. | | New |
| L1-03 | As Library, I add merchandise items, with variants described. | | New |
| L1-04 | As Library, I edit, hide or remove an item. | | New |
| L1-05 | As a user, I browse and search the catalogue by category and type. | | New |
| L1-06 | As a user, paid items say "Available at the Library desk" with one-tap WhatsApp and call buttons. | Number set by the Library HOD. | New |
| L2-01 | As Library, I upload free PDF or audio content with details and cover. | Marked "Free". | New |
| L2-02 | As a user, I read free PDFs and play free audio in the app. | | New |
| L3-01 | As Library, I set a starting quantity for physical items. | | New |
| L3-02 | As Library, I record stock out and in with a note. | Quantities only, never money. Logged. | New |
| L3-03 | As Library, I'm alerted when an item falls to 10 or fewer. | Push and web bell to the Library team. | New |
| L3-04 | As a user, an item with no stock shows "Out of stock". | | New |

**Deferred:** church policies, sales records and revenue, analytics, discounts, paid digital content, in-app ordering.

---

### 4.14 Real Estate (RE)

**Goal:** members see what the Tower of Faith offers floor by floor, contact each facility, and find spaces to let. Real Estate keeps it correct.

#### 4.14.1 Permissions

Real Estate HOD and delegates edit everything below. Roster members have no portal access. Administration no longer edits facilities.

#### 4.14.2 Pages

| Page | Contents |
|---|---|
| Tower of Faith | Floors and facilities |
| Spaces to let | Vacant spaces |

**Dashboard cards:** facilities listed, incomplete facilities (missing contact, photo or hours), spaces available.

#### 4.14.3 Stories

| ID | Story | Key rules | Status |
|---|---|---|---|
| RE1-01 | As Real Estate, I manage floors with name and order. | | New |
| RE1-02 | As Real Estate, I add a facility to a floor: name, description, responsible person (member or typed name), phone, WhatsApp, opening hours, photos. | Uses the existing facilities table; permission moves to Real Estate. | Change |
| RE1-03 | As Real Estate, I set opening hours per weekday, including closed days. | App shows "Open now" or "Closed". | New |
| RE1-04 | As Real Estate, I upload photos per facility and choose the cover. | | New |
| RE1-05 | As Real Estate, I edit, reorder, hide or remove a facility. | Incomplete facilities stay hidden from the app until they have at least a contact. | Change |
| RE1-06 | As a user, I browse the Tower and contact facilities. | M7-01, M7-02 | New |
| RE2-01 | As Real Estate, I list a space to let: title, building and floor, size, description, photos, optional price, contact. | | New |
| RE2-02 | As Real Estate, I mark a space available, reserved or let. | Let spaces leave the app. | New |
| RE2-03 | As Real Estate, I edit or remove a listing. | | New |
| RE2-04 | As a user, I browse spaces to let and contact Real Estate in one tap. | M7-03 | New |

**Starting data:** staging holds sample facilities for demos. Production starts with the real facility names (Heritage Academy, restaurant, saloon, conference halls, Leadership Institute, parking, offices) as hidden drafts, completed by Real Estate after appointment.

**Deferred:** construction and maintenance, quotations and suppliers, tenancy, defects, projects, committee, consultants, site management, reviews, reports.

---

## 5. Notification catalogue

Channels: **P** push, **I** in-app centre, **B** web bell, **E** email, **S** SMS. "Mutable" refers to the categories in Section 4.5.

| # | Trigger | Recipients | Channels | Mutable | Story |
|---|---|---|---|---|---|
| N01 | Account created | New user | E | No | F1-10 |
| N02 | Password reset requested | That user | E | No | F1-03 |
| N03 | Account deleted | Former user | E | No | F1-06 |
| N04 | Profile submitted or resubmitted | Administration HOD and delegates | P, B | No | F4-05 |
| N05 | Profile verified | Member | P, I, E | No | F4-06 |
| N06 | Profile sent back (with reason) | Visitor | P, I, E | No | F2-05 |
| N07 | Mentorship completion awaiting confirmation | Administration HOD and delegates | P, B | No | F4-05 |
| N08 | Mentorship completion confirmed or rejected | Member | P, I | No | A2-04 |
| N09 | Monthly mentorship reminder | Verified members not completed | P, I | Yes | F2-15 |
| N10 | Department claimed | That HOD | P, B | No | F4-07 |
| N11 | Claim confirmed or declined (with optional reason) | Member | P, I | No | S3-05, S3-06 |
| N12 | Added to or removed from a roster | Member | P, I | No | S3-07, S3-09 |
| N13 | Appointed HOD, delegate or clan elder | Appointee | P, I, B | No | F4-03 |
| N14 | New leader appointed | That roster or clan | P, I | Yes | F4-03 |
| N15 | Role removed | Person | P, I | No | F3-10 |
| N16 | Church event created | Event audience | P, I | Yes | F4-01 |
| N17 | Church event changed or cancelled | Event audience | P, I | Yes | A5-03, A5-04 |
| N18 | Church event reminders (7 days and 1 day before) | Event audience | P | Yes | F4-02 |
| N19 | Weekly program reminder | All signed-in users | P | Yes | F4-02 |
| N20 | Program occurrence cancelled (when Administration chooses to notify) | All signed-in users | P, I | Yes | A4-02 |
| N21 | Announcement first published | All signed-in users | P, I | Yes | F4-01 |
| N22 | Department activity created, changed or cancelled | Verified roster; web bell for portal users | P, I, B | Yes | F4-17 |
| N23 | Department activity reminder | Verified roster | P | Yes | F4-17 |
| N24 | Department message | Verified roster | P, I | Yes | S5-01 |
| N25 | HOD notice | Selected HODs | P, B | No | F4-20 |
| N26 | Member joined or moved into clan | Clan elder | P, B | No | F3-12 |
| N27 | Clan message | Verified clan members | P, I | Yes | F3-13 |
| N28 | Clan activity created, changed, cancelled, reminder | Verified clan members | P, I | Yes | F3-18 |
| N29 | Super T nomination reminders (Sunday 1PM and 8PM) | Clan elders | P, B | No | Section 4.4 |
| N30 | Super T gate assignment | Assigned member | P, I | No | F3-14 |
| N31 | Super T gate reminder (overnight allowed) | Assigned member | P | No | Section 4.4 |
| N32 | Gate marked not observed | Clan elder | P, B | No | ST1-03 |
| N33 | Followed program is live | Followers | P | Yes | R1-07 |
| N34 | New prayer request or testimony (outside broadcasts) | Pastoral HOD and delegates | P, B | No | PS2-03 |
| N35 | Prayer request prayed for | Sender (identity hidden from Pastoral) | P, I | Yes | PS2-05 |
| N36 | Follow-up assigned | Hospitality member | P, B | No | H2-04 |
| N37 | Clan assigned by Hospitality | Member and clan elder | P, I (elder also B) | No | H5-04 |
| N38 | SMS credit low | Hospitality HOD | P, B | No | H3-04 |
| N39 | Thank-you SMS after first visit | Consenting walk-in | S | Consent withdrawal only | H3-05 |
| N40 | Manual SMS | Selected consenting visitors | S | Consent withdrawal only | H3-01 |
| N41 | In-app message to app visitors | Selected app visitors | P, I | Yes | H2-05 |
| N42 | Giving details changed or method switched | Pastoral HOD, System Admin | P, B | No | FN2-02 |
| N43 | Library item low on stock | Library HOD, delegates, roster | P, B | No | L3-03 |
| N44 | Service renewal approaching | System Admins | P, B | No | A8-05 |
| N45 | Tomorrow has no devotional | Media (Dashboard warning, no push) | Dashboard | n/a | D1-02 |

**Delivery rules**

- Every push opens the related item (F4-12, F4-13); items that ended open marked as ended.
- Images appear in the in-app centre and web bell always, and in the push where supported (F4-11).
- Muting stops push only; items still appear in the in-app centre.
- Pending claimants never receive department activity or message notifications.

---

## 6. Non-functional requirements

| ID | Area | Requirement |
|---|---|---|
| NF-01 | Authorization | Every permission in this document is enforced in backend functions, not only in the interface. Automated tests cover the permission rules (F5-09). |
| NF-02 | Privacy | Directory sharing is off by default and enforced on the server. Contact details follow Section 3.5. Prayer request senders are never revealed. Radio Insights never show named individuals or individual locations. |
| NF-03 | Consent | Walk-in phone numbers require recorded consent; withdrawal stops SMS and contact buttons. |
| NF-04 | Data protection | Account deletion anonymizes personal data. Hospitality can delete walk-in records on request. Registering with Uganda's Personal Data Protection Office is recommended (Section 11.1). |
| NF-05 | Audit | Role changes, roster changes, verification decisions, deletions, giving setting changes, stock movements, radio overrides, recording changes and hidden submissions are written to the activity log with who and when. Giving change history cannot be edited. |
| NF-06 | Resilience | Every screen shows a friendly message and retry on failure; no blank pages or crashes (F5-06). The web portal has error screens. |
| NF-07 | Poor connections | Lists load progressively; uploads (recordings, photos) resume after interruption. |
| NF-08 | Phone browsers | Every web portal page is usable on a phone-sized screen (S1-04), with priority on clan, Hospitality, Media and department pages. |
| NF-09 | Background audio | Radio continues with the screen locked or the app in the background, with lock-screen controls. |
| NF-10 | Sessions | The mobile app keeps users signed in until sign-out, deletion or long expiry (F1-09). |
| NF-11 | Time zone | All schedules, reminders, deadlines and "open now" use East Africa Time (Kampala). |
| NF-12 | Language | English only. |
| NF-13 | Observability | Errors and crashes reported to Sentry from mobile, web and backend. |
| NF-14 | Updates | Mobile fixes that don't change native code ship through Expo updates, with separate staging and production channels. |
| NF-15 | Backups | Production is backed up regularly and always before a risky change such as a migration. |
| NF-16 | Environments | Staging mirrors production and holds sample data; production never holds sample data; every change is tested on staging first; production deployments are Andrew's alone. |
| NF-17 | Content authority | Only signed-in users can read church content (F3-08). |
| NF-18 | Honesty | No mock data, fake counts or false confirmations reach users (e.g. giving shows guidance, not "gift received"). |

---

## 7. External services

| Service | Used for | Phase 01 setup |
|---|---|---|
| **Convex** | Database, backend functions, scheduled jobs | Separate staging and production deployments; paid plan for production backups if needed |
| **Cloudflare R2** | Photos, cover images, recordings, free Library files | Separate buckets per environment |
| **Cloudflare Pages** | Web portal hosting | Production on the church domain |
| **Expo (EAS)** | Mobile builds and over-the-air updates | Staging and production channels |
| **Push notifications** (Apple and Google, via Expo) | Push delivery | Church's own credentials |
| **Resend** | The five system emails | Church domain verified; replies to kingdomlifeug@gmail.com |
| **Africa's Talking** | Hospitality SMS | Account, "KLT" sender ID registration, prepaid credit from Church Finance, delivery reports |
| **Google Cloud** | Google sign-in | Credentials for Android, iPhone and web; consent screen with privacy policy |
| **Caster FM** | Radio stream | Existing; status detection reads the stream |
| **Sentry** | Error reporting | Free tier |
| **YouTube** | Past events (links and thumbnails) | No account needed |
| **MTN MoMo, Airtel Money, banks** | Giving outside the app | Codes, numbers and recipient names entered by Finance |
| **Apple App Store Connect, Google Play Console** | Distribution | Accounts in the church's name; TestFlight and closed testing |

All paid services are recorded in the cost register (F3-17).

---

## 8. Platform and release (F5)

| ID | Requirement | Status |
|---|---|---|
| F5-01 | **First build task.** Delete the `docs/` folder and every reference to it (including comments citing the missing `docs/Alignment.md`). Commit this SRS as `spec/SRS.md`. Rewrite `AGENTS.md` and `CLAUDE.md` as short, correct working instructions (commands, folder layout, conventions) that point to this SRS for product behaviour. The DATA_MODEL increments convention retires. | Change |
| F5-02 | Production setup: database deployment, file storage, push credentials, portal on the church domain, Resend domain, Google sign-in credentials, Africa's Talking account. | New |
| F5-03 | Safe seeding: production gets only the 12 clans, 13 departments, the seeded radio programs and the Tower of Faith facility names as hidden drafts; the first System Admin only from `SEED_ADMIN_EMAIL`, which must be set; the content seed never grants roles; no sample data. Staging gets sample data. | Change |
| F5-04 | Staging mirrors production; changes are tested there first. | Change |
| F5-05 | Regular restorable backups, and before risky changes. | New |
| F5-06 | Friendly error screens with retry on web and mobile. | New |
| F5-07 | Sentry error and crash reporting. | New |
| F5-08 | Expo over-the-air updates with staging and production channels. | New |
| F5-09 | Automated tests for permission rules. | New |
| F5-10 | Store readiness: app name, icon, splash, identifiers under the church, privacy policy and deletion pages, store privacy questionnaires, screenshots, review notes explaining the giving flow. | New |
| F5-11 | "Help & Support" in the app, reaching Andrew. | New |
| F5-12 | Launch content before the pilot: Home welcome and vision, weekly programs, broadcast schedule, first devotionals, giving details, department descriptions. Tower of Faith is completed by Real Estate after appointment. | New |

---

## 9. Data rules

| Data | Rule |
|---|---|
| Deleted accounts | Personal data anonymized; anonymous record kept for statistics and audit. |
| Walk-in visitors | Kept until removed by Hospitality or on request; contact only with consent. |
| Prayer requests | Sender link stored privately for the "prayed for" notice only; never shown. |
| Listening records | Per user per broadcast with time played; named view only for the user's clan elder; everything else aggregated. |
| Listening location | City-level only, derived from the connection; never stored or shown per person. |
| Recordings | Kept until Media removes them. |
| Giving | No payments, amounts or giving activity stored. Giving setting history kept permanently. |
| Library stock | Quantities and movements only, never money. |
| Audit log | Kept permanently. |

---

## 10. Deferred register

Everything below is out of Phase 01 and considered after launch.

| Area | Deferred |
|---|---|
| Paused departments | Education (Mentorship & Discipleship, Leadership Institute), Worship Ministry, Ushering, Missions & Outreach, Children's Ministry, Eagles Youth |
| Platform | Suspension; two-factor authentication; offline mode; languages other than English; SMS to members; automatic store download figures; automatic billing figures |
| Mobile | Activity check-in and attendee counts; Appointments; Inquiries; Bereavement reporting; Procurement opportunities; Booking |
| Clans | Elder's spouse access; internal clan structure; minutes; Elders Council archive; birthday notifications; clan finances |
| Shell | Inventory; activities planner with assigned people; sub-sections and section heads; audio meetings and minutes; periodic reports; requisitions; messages to the whole church from departments; HOD conversation replies |
| Administration | Monthly HOD summary; clan audiences for events; department audiences for announcements |
| Media | Public live chat; quick praise messages; visible listener list; notes during broadcasts; social media and YouTube feed; broadcaster check-in and check-out |
| Hospitality | Requisitions; check-in system |
| Finance | Income recording; requisitions and approvals; budgets; cash capture; giving statements; expense categories; vendors; marketplace; payment processing and tracking; reports; usage statistics |
| Pastoral | Requisition and budget oversight; approvals; task tracker; queries to departments; meetings; governance reporting; publishing to the church |
| Library | Church policies; sales records; analytics; discounts; paid digital content; ordering |
| Real Estate | Construction and maintenance; quotations and suppliers; tenancy; defects; projects; committee; consultants; site management; reviews; reports |

---

## 11. Non-code dependencies and risks

### 11.1 To-do before the pilot

1. Request the church's D-U-N-S number; open Apple and Google Play developer accounts in the church's name.
2. Buy the church domain; verify it with Resend.
3. Publish a small church web page with the privacy policy and account-deletion request page.
4. Create the Google Cloud project for Google sign-in.
5. Open the Africa's Talking account; start "KLT" sender ID registration; buy starting credit.
6. Test MTN and Airtel codes on real SIMs.
7. Prepare the production checklist, including `SEED_ADMIN_EMAIL`.
8. Get Church Finance approval for running costs.
9. Register with the Personal Data Protection Office (recommended; confirm with church leadership).
10. Gather launch content (F5-12).

### 11.2 Risks

| Risk | Mitigation |
|---|---|
| Scope exceeds about 144 build hours | Estimate and rank every item in the build plan; hide the lowest-ranked work rather than move the launch. |
| Apple account and review delays | Start now; fallback is an Android-first pilot with iPhone a week or two later. |
| SMS sender ID approval takes weeks | Start now; generic number until approved. |
| Single developer and support person | Sentry, over-the-air updates and staging reduce time to fix. |
| Radio dependency | Design the Radio data model before the clan portal's Super T and listening features. |
| Stream status detection accuracy | Media's manual override (R2-05). |

---

## 12. Implementation notes for the build plan

These are not requirements; they guide ordering.

1. F5-01 first, then production setup (F5-02, F5-03).
2. Launch blockers: F1-09 session persistence, F1-03 password reset, A1-03 dashboard error, F4-03 appointment notices to all users, F2-12 spouse search privacy, dead tiles and the elder 404.
3. Department-scoped permissions and the shared shell (Section 4.7), since every department builds on them.
4. Radio data model before the clan portal's Super T and listening stories.
5. The detailed estimate, ranking and week-by-week plan live in a separate build plan document.

---

## 13. Document history

| Version | Date | Change |
|---|---|---|
| 1.0 | 30 September 2026 | First agreed version, assembled from the foundation decisions and module walkthroughs 1 to 9. |
