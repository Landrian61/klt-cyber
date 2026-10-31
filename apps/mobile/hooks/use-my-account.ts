import { useQuery } from 'convex/react';
import { api } from '@/lib/api';

/**
 * App-wide auth/membership state, sourced from the reactive Convex query
 * `getMyAccount`. Returns the base user, their member profile (or null), and
 * their active role assignments.
 *
 * Membership is keyed off `user.role`, NOT `profile !== null`: a `memberProfiles`
 * row exists in `pending_verification` before the user is a member — the role
 * only flips to `member` once Administration verifies it. So a submitted-but-
 * unverified user is `isPending`, not `isMember`, and stays gated out of
 * member-only surfaces until approved.
 *
 * `isPending` and `isSentBack` are two DIFFERENT unverified states (spec 0014,
 * AC-31) and every consumer has to handle both. They are deliberately not
 * collapsed into one flag: the two need opposite copy. A pending profile is
 * waiting on Administration and the person has nothing to do; a sent-back one
 * is waiting on the person and asking them to act. Before this split a
 * sent-back person matched neither flag and so read as a plain visitor,
 * getting told to "Complete your profile" for a profile they had already
 * submitted twice.
 */
export function useMyAccount() {
  const account = useQuery(api.profile.getMyAccount);

  const isLoading = account === undefined;
  const role = account?.user.role;
  const profile = account?.profile ?? null;

  const isMember = role === 'member';
  const isPending =
    !isMember && profile?.profileStatus === 'pending_verification';
  const isSentBack = !isMember && profile?.profileStatus === 'sent_back';
  const isVisitor = !!account && !isMember;

  return {
    /** `{ user, profile, activeRoles }` while loaded, else `undefined`. */
    account,
    /** True until the query first resolves. */
    isLoading,
    /** True when the user has been verified as a member. */
    isMember,
    /** True when signed in but not yet a verified member (includes pending). */
    isVisitor,
    /** True when a profile has been submitted and is awaiting verification. */
    isPending,
    /**
     * True when a reviewer handed the profile back with a reason and it is
     * waiting on this person to edit and resubmit it. Mutually exclusive with
     * `isPending`; both imply `isVisitor`.
     */
    isSentBack,
    user: account?.user,
    profile,
    activeRoles: account?.activeRoles ?? [],
  };
}
