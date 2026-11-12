/**
 * The activity log actions the Administration dashboard may show (spec 0021,
 * AC-1). Anything not listed here stays off the dashboard, so a new church
 * action is invisible until someone adds it. `role.assigned` and
 * `role.revoked` entries for `system_admin` are always left out by the query,
 * whatever this list says.
 */
export const CHURCH_ACTIVITY_ACTIONS = [
  "profile.submitted",
  "profile.resubmitted",
  "profile.verified",
  "profile.sent_back",
  "department.claim_confirmed",
  "department.claim_declined",
  "department.member_added",
  "department.delegate_appointed",
  "department.delegate_removed",
  "role.assigned",
  "role.revoked",
  "content.event_created",
  "content.event_updated",
  "content.event_cancelled",
  "content.event_archived",
  "content.announcement_created",
  "content.announcement_updated",
  "content.announcement_published",
  "content.program_created",
  "content.program_updated",
  "content.program_activated",
  "content.program_deactivated",
  "content.program_occurrence_cancelled",
  "content.program_occurrence_restored",
  "content.activity_created",
  "content.activity_updated",
  "content.activity_deleted",
  "department.activity_created",
  "department.activity_updated",
  "department.activity_cancelled",
] as const;

export type ChurchActivityAction = (typeof CHURCH_ACTIVITY_ACTIONS)[number];
