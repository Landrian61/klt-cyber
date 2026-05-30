import { useQuery } from 'convex/react';
import { api } from '@/lib/api';

/**
 * App-wide auth/membership state, sourced from the reactive Convex query
 * `getMyAccount` (PR 8). Returns the base user, their member profile (or null
 * for a visitor), and their active role assignments.
 *
 * Membership is detected by `profile !== null` (equivalently
 * `user.role === 'member'`); the two move together atomically when
 * `completeProfile` runs, so the query updates the whole app at once.
 */
export function useMyAccount() {
  const account = useQuery(api.profile.getMyAccount);

  const isLoading = account === undefined;
  const isMember = !!account && account.profile !== null;
  const isVisitor = !!account && account.profile === null;

  return {
    /** `{ user, profile, activeRoles }` while loaded, else `undefined`. */
    account,
    /** True until the query first resolves. */
    isLoading,
    /** True when the user has completed their member profile. */
    isMember,
    /** True when the user is signed in but has not completed a profile. */
    isVisitor,
    user: account?.user,
    profile: account?.profile ?? null,
    activeRoles: account?.activeRoles ?? [],
  };
}
