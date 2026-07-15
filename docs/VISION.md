# KLT Cyber Church — Vision

> The North Star for this project. Every contributor should read this before
> making a product-shaping decision. When later requests or assumptions conflict
> with what is written here, this document is the reference — changes to it
> should be deliberate, discussed, and recorded, not silently drifted into.

---

## 1. Purpose of this document

This is not the church's product specification. That lives in
`KLT_Cyber_Church_APP.docx` — a 40-page brief that describes the full ministry
vision, including features deliberately deferred beyond MVP. This document
narrows that brief into what we will actually build for the MVP, and what will
explicitly wait.

The audience is contributors — engineers, designers, reviewers — joining the
project. It exists to give everyone the same understanding of the problem, the
users, the scope, and the principles, so we build the same product together
rather than approximations of it.

---

## 2. Vision and mission

**Vision.** To grow God's people into spiritual maturity so that they may
manifest Kingdom life holistically, through a digital church ecosystem that
connects members, enhances spiritual growth, and streamlines church
administration through technology.

**Mission.** To establish a digital platform that strengthens the relationship
between the church, its members, and its leadership by creating a structured,
efficient, and spiritually enriching ecosystem. The platform enables members
to remain connected to church activities regardless of location; provides
accessible teaching, media, and spiritual development materials; creates
reliable communication between leadership and the congregation; establishes a
centralized management system for church operations; and supports transparency
and accountability in church stewardship.

---

## 3. Target users

Four groups. Each has a distinct relationship to the system.

**Visitors** are anyone who has signed up but not yet completed a member
profile. They may be first-time app users exploring the ministry, guests who
attended a service and want to stay in touch, or people considering formal
membership. Visitors have real, meaningful access — Home, Radio, Library — and
are treated as welcomed, not gated.

**Members** are the confirmed church community, formed by completing the
mobile-only profile-completion flow. Members have full access to the mobile
app, including the Updates feed and member directory. Members without
administrative roles have no access to the web portal.

**System administrators** are the technical stewards of the platform.
Bootstrapped via a seed script. They configure the system, assign roles to
leaders, and hold ultimate operational authority. They may or may not be
church members in the consumer sense.

**Role-holders** are church leaders and specialists who have been assigned
scoped administrative roles. In MVP, this includes Clan Elders, the Church
Administrator, and the Radio Administrator. Role-holders use the web portal to
manage their scope of responsibility. Multi-role is normal and expected — one
person may hold two or more roles and switches between them via a picker on
each sign-in.

Pastoral leadership (Team Leader, First Lady, Executive Pastor, Resident
Pastor) will eventually fall into the role-holder category, but the Pastoral
Team Portal is deferred from MVP (see §5) pending stakeholder discussion.

---

## 4. Product scope

### 4.1 Two products, one backend

The KLT Cyber Church project delivers two distinct products against one shared
Convex backend.

**The mobile app is for consumption.** It is the touchpoint for every visitor
and member. It carries the ministry outward: sermons, radio, announcements,
events, community. It is where visitors become members. Its design language,
per `docs/INTERFACE_SPEC.md`, is warm, editorial, and unhurried — Sacred
Curator.

**The web admin portal is for administration.** It is where role-holders do
the work of running the church digitally: managing members, coordinating radio
broadcasts, structuring clan communities, planning events. It is not consumed
by end users; it is *used* by leaders. Its design language derives from and
stays continuous with the mobile app, adapted for desktop density and
keyboard/mouse interaction.

Members do administration on web. Members do consumption on mobile. Nothing
about administration lives in the mobile app. Nothing about member consumer
engagement lives in the web portal. This separation is non-negotiable — it
keeps each product coherent about what it exists to do.

### 4.2 Mobile app MVP

The mobile app ships with the following features.

**Authentication and sign-up.** Email/password and Google OAuth. Sign-up
creates an authenticated visitor. No profile fields are captured at sign-up
beyond what the provider supplies.

**Profile completion.** A mobile-only flow that a visitor initiates when they
choose to become a member of the church community. Captures sex and marital
status; optionally date of birth, phone, clan affiliation, and children.
Creates a `memberProfiles` record and promotes the user from visitor to
member. Optional fields — including profession and clan — can be added or
edited later from the profile screen.

**Home.** A personalized landing showing a leadership welcome, the church's
vision and core values, the current annual and monthly themes with theme
scripture, the weekly program, upcoming events, and check-in affordances
for activities. All dynamic content — themes, weekly program, events — is
authored in Church Administration. A scripture-of-the-day rotates through
content seeded at deploy time; a richer scripture-management surface is
deferred.

**Reign Radio.** Live streaming with background playback and a dynamic hero
visual per broadcast; upcoming broadcast schedule with start notifications;
real-time listener presence (who else is tuned in and how many); personal
notes with auto-save during broadcasts; interactive participation through
live comments, quick praise responses, and testimony and prayer request
submissions.

**Library and Information.** Read-only access to church-published resources
(books, teachings, sermon content, policies). The Library management side
(content authoring, sales, inventory) is deferred; MVP delivers the
consumption side against seeded content.

**Updates (member-only).** Weekly announcements and priority notices. Gated
behind profile completion — visitors see a friendly nudge; members see the
feed.

**Member directory (member-only).** Public profiles of registered members:
name, avatar, clan, and badges (Elder, HOD, and others as those roles ship).
Gated behind profile completion.

**Profile management.** A screen where members view and edit their profile:
name, avatar, phone, profession, date of birth, and clan affiliation. Children
records are added, edited, and removed from here. `sex` remains admin-editable
only.

**Notifications.** Push notifications via Firebase Cloud Messaging, plus an
in-app notification center. Users receive notifications for broadcast start
times, activity reminders, and profile and role events.

**Deferred from mobile MVP.** Giving and all financial features are deferred
entirely — the Giving tab ships hidden or as a "Coming soon" placeholder.

### 4.3 Web admin portal MVP

The web admin portal ships with four modules. Each is a route group within the
same Next.js application, accessible after sign-in via the role picker, and
gated by middleware to the appropriate role assignment.

**System Administrator.** The bootstrapped root of the administrative
hierarchy and the design template for every subsequent module. It manages
users at the account level: list, filter, search, and view detail; assign and
revoke roles; suspend and reactivate accounts; verify clan affiliations. It
includes a dashboard with summary statistics (total users, visitors vs.
members, sign-ups per week, pending approvals) and an activity-log viewer.

**Church Administration (subset).** The operational hub for church programs,
events, and central communication. MVP scope:

- *Event creation and management.* Create and edit events that surface on the
  mobile Home tab.
- *Weekly church program.* Manage the schedule of weekly activities that
  appears on the mobile Home tab.
- *Annual church planner (basic).* Structure the calendar of scheduled events
  across the year.
- *Church-wide communication authority.* Publish announcements that appear in
  the mobile Updates tab.
- *Annual and monthly themes.* Set the current annual theme (with theme
  scripture) and monthly theme; both display on every mobile user's Home tab.
  The church spec assigns this to Pastoral Team; since Pastoral Team is
  deferred from MVP, theme management moves to Church Admin and may transfer
  post-MVP.
- *Intelligent membership sorting.* Automatic categorization of users by
  profile attributes (age brackets, gender, marital status, roles,
  professional groups). Used by downstream modules for their queries; visible
  to Church Admin as read-only classification views.

Deferred within Church Admin: requisition oversight (finance-adjacent),
sub-section creation, aggregated church inventory, Event Lead appointment
eligibility rules, formal event approval workflow, advanced reporting.

**Clans (subset).** The community organization module. MVP scope:

- *Clan Elder role.* System admin assigns Clan Elders to specific clans — one
  Elder per clan, revoke-and-replace on conflict.
- *Add members to clans.* Elders add members to their clan roster.
- *Clan member management.* Elders view their clan members and record clan
  activity.
- *Super T delegation.* Elders nominate two clan representatives to Super T
  broadcast slots for a given week.

Deferred within Clans: internal clan leadership structure, meeting minutes
archive, Elders Council archive, birthday notification cascade timing, clan
financial contribution monitoring.

**Radio Administrator (subset).** The broadcast operations module. MVP scope:

- *Broadcast schedule.* Create and edit broadcast entries — title, host, date,
  time, program description. Hosts are selected from registered users.
- *Banner image uploads.* Attach a hero image to each broadcast for display in
  the mobile Reign Radio interface.
- *Radio monitoring.* A tracking panel showing upcoming broadcasts, their
  assigned hosts, and schedule state.
- *Listenership.* Real-time count of listeners currently tuned in.

Deferred within Radio Admin: broadcaster check-in/check-out flow, absence
alerts, testimonies and prayer requests distribution to church leadership, and
the multi-host assignment workflow. Super T delegation happens through the
Clans module, not through Radio Admin.

---

## 5. Explicitly out of MVP

Recording deferrals explicitly is as important as recording inclusions. It
protects against scope creep and gives future-us an honest record of what we
thought was worth waiting on.

**Deferred web portal modules.**

- **Pastoral Team Portal** — under further discussion with stakeholders before
  its scope is defined.
- **Mentorship & Discipleship Portal.**
- **Ushering Portal.**
- **Media & Communications broader features** — only the Radio Admin subset
  ships.
- **Announcement Portal as a standalone module** — announcement capability is
  folded into Church Admin's communication authority.
- All other church-spec portals: **Youth Church, Children's Church, Men's,
  Women's, Creative Arts, Finance & Giving, Library management, Missions,
  Construction & Estates, Hospitality.**

**Deferred mobile app features.**

- **Giving** and all financial infrastructure.

**Deferred functional capabilities.**

- Password reset, email verification, two-factor authentication.
- Multilingual UI (English only for MVP).
- Offline mobile capability.
- Bulk actions in admin (e.g., multi-select suspend).
- Export to CSV / Excel.
- Advanced reporting suites across modules.
- Ecommerce and marketplace.
- Voice meetings (spec mentions; deferred).
- Admin impersonation ("sign in as user").

**Deferred process capabilities.**

- Formal approval workflows for event creation. In MVP, system admin uses
  judgment.
- Full role-eligibility automation. In MVP, only `profileCompleted` is
  enforced; per-role rules (e.g., Elder requires male + married + 35+ +
  mentorship complete) arrive with their respective modules.
- SMS integration via Africa's Talking is planned but not shipped in MVP.

Nothing on this list is refused permanently. Deferral is a scoping decision,
not a rejection.

---

## 6. Guiding principles

Product decisions across the project trace back to these principles. A
contributor should be able to justify any product-shaping decision by pointing
at one. If none applies, the decision requires discussion — not silent
invention.

**1. Authentication is not membership.** Signing up creates an authenticated
visitor. Becoming a member requires the deliberate, mobile-only act of
completing a profile. Data reflects this: no `memberProfiles` row means
visitor; a row means member.

**2. Mobile is consumption; web is administration.** These are separate
products, each coherent about its purpose. No administrative surface belongs
on mobile. No consumer engagement belongs on web. Operationally, the mobile
app is a *view* over content authored in the admin portal — themes, weekly
program, events, announcements, radio schedule, library resources. Static
seeded content (scripture of the day, initial library resources) is the
narrow exception, deployed once and curated via commits until a real admin
surface exists.

**3. Consumer lifecycle and administrative authority are orthogonal.** A user
has a lifecycle stage (visitor or member) *and* zero or more role assignments.
These dimensions are independent. A system administrator might never complete
a member profile; a fully invested member might hold no administrative role.

**4. Profile completion is mobile-only.** There is no web pathway to becoming
a member. Users who only ever use the web have no member profile and remain
visitors — they don't need member features because they have administrative
roles instead.

**5. Web access is gated by role, not membership.** A web session is valid
only if the user has ≥1 active role assignment. Users with no roles are
directed to `/unauthorized` after sign-in with a friendly nudge toward the
mobile app. This invariant is non-negotiable.

**6. Multi-role is structural.** A user may hold any number of role
assignments. The web portal handles this with a role picker on every sign-in;
the chosen role scopes what the portal then shows.

**7. Authorities own the structural data.** Mentorship status, department
membership, and leadership-institute progress are not user-claimable fields.
Each is managed by the appropriate authority via that module's portal when it
ships. Profile completion captures bio only.

**8. Approval-state is a first-class pattern.** Records requiring verification
(starting with clan affiliation) carry an explicit approval state (pending /
verified / rejected) with verifier and timestamp. This pattern extends across
future modules.

**9. Cost-conscious.** The target user base is small. Every infrastructure
choice reflects this — Convex's generous free tier, Cloudflare Pages (free),
Cloudflare R2 (no egress fees), Africa's Talking (Uganda-optimized SMS
pricing). Premium tools are avoided unless their cost is justified against
real usage.

**10. PR-driven increments; `docs/DATA_MODEL.md` is the source of truth for
data.** Features ship as small, reviewable PRs. Data schema decisions live in
`DATA_MODEL.md` and are settled there before code. No schema change ships
without a corresponding update to that document.

---

## 7. Non-functional requirements

**Scale.** 500 registered users at MVP launch. Peak concurrency of 200
simultaneous users, expected around live broadcasts. The system is designed
for this scale; premature optimization for larger scale is discouraged.

**Performance.** Mobile interactions feel instant — most actions resolve
visually within 300 milliseconds. Web admin first-paint targets under 2
seconds on a typical connection. Convex's reactive queries provide sub-100ms
perceived responsiveness for most read operations at this scale.

**Availability.** Best-effort. Individual outages in Convex, Cloudflare, or
EAS are accepted as the trade-off of using managed services. No formal SLA.
Deploy windows are targeted to off-service hours.

**Data residency.** Convex is US-based. Cloudflare distributes globally at the
edge. Primary data storage outside Uganda has been accepted; there is no
regulatory constraint requiring in-country residency in the current context.

**Offline capability.** None for MVP. Both mobile and web require an active
connection.

**Localization.** English only for MVP. Mentorship classes offered in Luganda
and English (per the spec) refer to the *classes*, not the app UI.

**Security.** Standard practices — Better Auth with secure token storage via
`expo-secure-store` on mobile; HTTPS end-to-end; no secrets in the repository;
per-environment secret separation. No formal compliance target (HIPAA, GDPR-
strict, PCI). Financial data is deferred, materially reducing the current
security surface.

**Accessibility.** Baseline: keyboard navigation on web, meaningful alt text,
color contrast per WCAG AA. Formal audit deferred.

---

## 8. Definition of shipped

MVP is considered shipped when the following are true:

**Technical.**

- Every MVP feature — mobile and web — is deployed to production and reachable
  at its production URL.
- Both mobile binaries are approved and available on TestFlight and Play
  Internal at minimum; ideally on the App Store and Google Play.
- No known critical bugs open.

**Operational.**

- At least one system administrator has been onboarded and is comfortable
  using the portal.
- The Church Administrator role has been assigned to a real person, trained,
  and is actively maintaining the weekly program and events.
- At least three Clan Elders have been assigned and are actively managing
  their clan rosters.
- The Radio Administrator role has been assigned and has scheduled and hosted
  at least one live broadcast through Reign Radio.

**Community adoption (proposed baseline — subject to stakeholder alignment).**

- 50% of registered members have completed their member profile within 30 days
  of launch.
- Reign Radio has hosted at least four live broadcasts through the platform.
- The weekly church program on the Home tab is actively maintained.

These adoption metrics are engineering-proposed and can be tuned with
stakeholder input. Their function is to prevent "MVP" from becoming an
unbounded concept.

---

## 9. Open questions requiring stakeholder alignment

Recorded honestly so we do not build against wrong assumptions.

1. **Pastoral Team Portal scope.** Deferred from MVP pending stakeholder
   discussion. The current data model can accommodate any Pastoral Team
   design; the portal itself waits.

2. **Success metrics.** The baselines in §8 are engineering-proposed. Church
   leadership should validate or replace them before or shortly after MVP
   launch.

3. **Content ownership for the Home tab and Library.** Who is responsible
   day-to-day for keeping the weekly program updated, adding library
   resources, and maintaining the events calendar? This is a Church
   Administrator responsibility in MVP, but requires a person who is trained
   and committed.

4. **Radio Administrator identification.** Similarly, an actual person must
   hold the Radio Administrator role and be operationally ready before Reign
   Radio can launch.

5. **Data retention and archival policy.** No policy defined for MVP.
   Notifications, activity logs, and old broadcasts accumulate indefinitely.
   Worth revisiting once the system has run for a few months and real data
   volume is known.

6. **Backup and disaster recovery.** Convex provides its own backup
   mechanisms; no additional strategy is in place. Worth documenting
   explicitly once launched.

---

## 10. Related documents

- `docs/DATA_MODEL.md` — the schema and its evolution. Source of truth for all
  data decisions.
- `docs/INTERFACE_SPEC.md` — the Sacred Curator design language. Source of
  truth for all visual decisions.
- `docs/ARCHITECTURE.md` — system architecture (drafted next).
- `docs/ROLES.md` — the RBAC model in detail (drafted next).
- `docs/CONTRIBUTING.md` — the contribution workflow and conventions (drafted
  next).
- `KLT_Cyber_Church_APP.docx` — the original church specification. This
  document narrows that spec into MVP; refer to the spec for the church's
  fuller intent.