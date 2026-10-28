import type { RoleType } from '../enums/roles';

/**
 * The notification catalogue codes from SRS §5 (spec 0013).
 *
 * Shared because three readers have to agree on the same strings: the Convex
 * mutations that stamp `notifications.kind`, the schema validator that accepts
 * it, and (from feature 28) the settings screen that maps a code to the mute
 * category it belongs to. A code typed by hand in any one of them would show up
 * as a notice that silently ignores the member's mute choice.
 *
 * The full N01 to N46 range is listed even though only some are sent today, so
 * a feature that adds a notice picks its code from here rather than inventing
 * one.
 */
export const NOTIFICATION_KINDS = [
  'N01', 'N02', 'N03', 'N04', 'N05', 'N06', 'N07', 'N08', 'N09', 'N10',
  'N11', 'N12', 'N13', 'N14', 'N15', 'N16', 'N17', 'N18', 'N19', 'N20',
  'N21', 'N22', 'N23', 'N24', 'N25', 'N26', 'N27', 'N28', 'N29', 'N30',
  'N31', 'N32', 'N33', 'N34', 'N35', 'N36', 'N37', 'N38', 'N39', 'N40',
  'N41', 'N42', 'N43', 'N44', 'N45', 'N46',
] as const;

export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

/**
 * How each administrative role is named and explained to the people it
 * concerns (spec 0013): in the appointment, new leader and role ended notices,
 * and on the mobile role screen a tap on one of them opens.
 *
 * The labels are the SRS's own words (§1.3, §2.2), not the stored role type, so
 * `department_admin` reads as "delegate" everywhere a member sees it.
 */
export const ROLE_COPY: Record<RoleType, { label: string; description: string }> = {
  system_admin: {
    label: 'System Admin',
    description:
      'You look after the platform itself and can open every part of the web portal.',
  },
  clan_elder: {
    label: 'clan elder',
    description:
      'You lead your clan: you see its members, message them and plan its activities from the web portal.',
  },
  hod: {
    label: 'HOD',
    description:
      'You head your department: you confirm who serves on its roster, appoint delegates, message the roster and plan its activities from the web portal.',
  },
  department_admin: {
    label: 'delegate',
    description:
      'You help your HOD run the department: you message the roster and plan its activities from the web portal.',
  },
};

/** The deep link types that open the mobile "waiting on the web portal" screen. */
export const PORTAL_WORK_TYPES = ['profile_review', 'department_claim', 'hod_notice'] as const;

export type PortalWorkType = (typeof PORTAL_WORK_TYPES)[number];

/**
 * What the mobile portal work screen says is waiting, keyed by the deep link
 * type of the notice that opened it (spec 0013, AC-16). The work itself is done
 * on the web portal; this copy only says what it is and where to go.
 */
export const PORTAL_WORK_COPY: Record<PortalWorkType, { title: string; body: string }> = {
  profile_review: {
    title: 'A profile is waiting for review',
    body: 'Someone has submitted their member profile. Review it on the web portal to verify it or send it back.',
  },
  department_claim: {
    title: 'Someone asked to serve in your department',
    body: 'A member wants to join your roster. Confirm or decline the request on the web portal.',
  },
  hod_notice: {
    title: 'You have a notice from another HOD',
    body: 'Read the full notice on the web portal.',
  },
};
