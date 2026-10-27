# 0012d. Department messages and HOD notices

Child of [0012 Shared department shell](index.md). Covers S5-01 to S5-05 and acceptance criteria **AC-28** to **AC-32**.

## Summary

Two separate things that share one page. Department messages are the authoring side of `groupMessages`, the table spec 0010 shipped with a member facing read and no way to send: an HOD or delegate messages the whole department and verified roster members get it on their phones and under "My groups". HOD notices are new: a one way message from one HOD to one, several or all other HODs, with no reply path anywhere in the system.

## Design

### Department messages

`groupMessages` already carries `body`, `imageUrl`, `owner`, `sentBy`, and the soft delete pair `deletedAt` and `deletedBy`, with the comment recording that the soft delete exists so S5-03 leaves an audit trail. The mobile read side and the "My groups" section already exist. This child adds the three functions and the interface.

`sendDepartmentMessage({ departmentId, body, imageKey? })`, HOD or delegate or System Admin. Enforces `GROUP_MESSAGE_MAX_LENGTH` from `packages/shared`, writes the row with a department `owner`, dispatches N24 to the verified roster, and writes `department.message_sent` with `departmentId`. `imageKey` is an R2 object key, the same input name activities use, resolved on the way out as spec 0010's read side expects. A failed upload sends the message without the image and warns the author rather than dropping it silently.

`listDepartmentMessages({ departmentId, paginationOpts })` returns messages newest first, excluding soft deleted rows, each joined to its sender's display name. It paginates rather than reading a fixed window: S5-02 asks for "past messages", and a 90 day cut off would quietly make an older message unreachable in the portal even though it is the durable record the notification is not. The member facing read in spec 0010 keeps its own 90 day window; that window is about what a member's feed shows, not about what the portal can reach.

The table has no `sentAt` field on purpose: Convex appends `_creationTime` to every index, so `by_department` plus a descending read gives the order directly.

A sender whose account has been deleted renders as **"a former member"**. Account deletion anonymises the `users` row rather than removing it, so the join succeeds and returns an anonymised name; the label keeps that from reading as corrupted data.

`deleteDepartmentMessage({ messageId })` is the one place in this feature where authority depends on the row rather than only on the role:

| Caller | May delete |
|---|---|
| this department's HOD | any message in this department |
| this department's delegate | only messages where `sentBy` is themselves |
| System Admin | any |

It is a soft delete, so the message disappears from "My groups" and from the portal list while the row and its audit entry remain. Pushes already delivered cannot be recalled, which the interface says plainly before confirming. No read path returns a deleted message; the row exists for the audit trail and for nothing else.

### HOD notices

New table, because a notice is not a department message. It goes to a set of role holders rather than a roster, it has no owning department in the `groupOwnerValidator` sense, and S5-05 needs it readable back as sent and received lists after any notification is cleared.

```ts
hodNotices: {
  fromUserId: Id<"users">,
  fromDepartmentId: Id<"departments">?,   // absent when a System Admin sends
  body: string,                            // capped at HOD_NOTICE_MAX_LENGTH = 1000
  scope: "all" | "selected",
  recipientDepartmentIds: Id<"departments">[],  // empty when scope is "all"
  sentAt: number,
}
indexes: by_from on ["fromUserId"], by_sentAt on ["sentAt"]
```

Recipients are stored as **department ids, not user ids**. A notice records which departments were addressed and resolves to whoever currently holds each HOD seat. Storing user ids would freeze the notice to whoever held the role that day, so a newly appointed HOD would never see the notices addressed to their own department.

A notice has a body and no subject. The SRS describes a notice, not a thread, and `HOD_NOTICE_MAX_LENGTH` of 1000 characters is long enough to say the thing without becoming a document.

`sendNotice({ body, scope, recipientDepartmentIds })`. The sender predicate: anyone holding an active `hod` role for any department (which includes the Administration HOD), plus the Pastoral HOD (identified as an active `hod` role scoped to the department named "Pastoral", so the predicate is already satisfied by the first clause and is named here only because F4-20 and PS4-01 call it out), plus System Admin. A delegate may not send. `scope: "selected"` with an empty recipient list is rejected.

It writes the row, resolves each addressed department's active `hod` role assignment, dispatches N25 to those users, and writes an audit entry. Sending to your own department is allowed; it appears in both lists, which is accurate rather than a bug.

`listReceived({ paginationOpts })` returns notices where `scope` is `all`, plus notices whose `recipientDepartmentIds` contains a department the caller currently holds an active `hod` role for. It reads `by_sentAt` descending and paginates with **no time window**. An earlier draft used a recent window, which contradicted the intended behaviour that a newly appointed HOD finds the notices addressed to their seat: a window would hide anything older than it. Volume is a handful of notices per year across thirteen departments, so the whole table is cheap to page through, and an index on an array field would not help the `recipientDepartmentIds` containment test anyway.

`listSent({ paginationOpts })` reads `by_from` for the caller, newest first.

Both return `null` when unauthenticated. **There is no mutation that replies to a notice and no field that could hold one**; one way is enforced by the absence of the surface, not by a flag.

Both lists show the sender, the time, and the recipients (department names resolved from the stored ids, which stay correct across a rename). Every HOD who can see a notice can see who else was addressed; that is expected for a notice to a set of leaders.

**Read state is deliberately absent.** Notices are a list with no per notice read tracking here. The web bell (feature 28) is where unread counts and mark as read belong, and N25 already names the bell as a channel. Adding read state now would build half the bell twice.

## Build tasks

1. Add the `hodNotices` table with its two indexes, and `HOD_NOTICE_MAX_LENGTH` (1000) to `packages/shared` with a test, satisfies **AC-31**.
2. Build `sendDepartmentMessage` with the length cap, the N24 dispatch to verified roster members, the audit entry and the image warning path, satisfies **AC-28**.
3. Build `listDepartmentMessages`, paginated newest first, excluding deleted rows, joined to sender names with the former member fallback, satisfies **AC-29**.
4. Build `deleteDepartmentMessage` with the HOD any versus delegate own split as a soft delete, satisfies **AC-30**.
5. Build the shared Messages page: the compose form behind `can.sendMessage`, the paginated list with sender and time, the per row delete action, and the "already delivered pushes cannot be recalled" confirmation, satisfies **AC-28**, **AC-29**, **AC-30**.
6. Build `sendNotice` with its sender predicate, recipient resolution to current HOD seats, the N25 dispatch and the audit entry, satisfies **AC-31**.
7. Build `listReceived` and `listSent`, unwindowed and paginated, and the notices section of the page with composing behind `can.sendHodNotice` while both lists stay visible to any HOD, satisfies **AC-31**, **AC-32**.

## Rationale (short)

Department messages reuse `groupMessages` because the table, its soft delete and the member facing read already exist and were built for this writer. Notices get their own table because they address a role set rather than a roster, which does not fit `groupOwnerValidator`'s "one department or one clan" contract, and stretching that validator would weaken a shape the mobile read side depends on. Recipients are department ids so a notice follows the HOD seat rather than the person who held it, which is the difference between a notice to Finance and a notice to a named individual; the SRS asks for the former. The received list carries no time window because a window would contradict that whole design. Read state is left to the web bell so it is built once.

## Edge cases

- A notice addressed to a department with no current HOD is stored and reaches nobody, then becomes visible to the next appointed HOD. This is the intended consequence of addressing seats rather than people, and it is why `listReceived` has no window.
- A notice sent to all HODs is pushed only to the HODs holding a seat at send time, but is visible in the received list to any HOD appointed later, because `scope: "all"` is evaluated at read time. The two channels therefore differ by design.
- An HOD who sends a notice including their own department sees it in both lists.
- A System Admin sending a notice has no `fromDepartmentId`; the list shows their name without a department, and they never appear as a recipient since they hold no HOD seat.
- A delegate attempting `sendNotice` is rejected server side, and the compose form is hidden by `can.sendHodNotice`.
- A delegate attempting to delete another person's message is rejected on the `sentBy` check even though they hold the delete capability for their own.
- A soft deleted message never appears in any read path. The row exists only for the audit trail.
- Sending a message to a department whose verified roster is empty writes the row and dispatches to nobody, rather than failing.
- A body over the cap is rejected server side as well as counted down in the form.
- A department renamed after a notice was sent still shows correctly, because recipients are stored as ids.
