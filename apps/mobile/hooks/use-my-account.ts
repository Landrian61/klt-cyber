import { useQuery } from 'convex/react';
import { api } from '@/lib/api';

/**
 * App-wide auth/membership state, sourced from the reactive Convex query
 * `getMyAccount`. Returns the base user, their member profile (or null), and
 * their active role assignments.
 *
 * Membership is keyed off `user.role`, NOT `profile !== null`: since the
 * Increment-4 wizard (docs/Profile-completion-mobile.md), a `memberProfiles`
 * row exists in `pending_verification` before the user is a member — the role
 * only flips to `member` once a church admin verifies it. So a submitted-but-
 * unverified user is `isPending`, not `isMember`, and stays gated out of
 * member-only surfaces until approved.
 */
export function useMyAccount() {
  const account = useQuery(api.profile.getMyAccount);

  const isLoading = account === undefined;
  const role = account?.user.role;
  const profile = account?.profile ?? null;

  const isMember = role === 'member';
  const isPending =
    !isMember && profile?.profileStatus === 'pending_verification';
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
    user: account?.user,
    profile,
    activeRoles: account?.activeRoles ?? [],
  };
}
