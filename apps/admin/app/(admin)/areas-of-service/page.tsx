import { redirect } from "next/navigation";
import { fetchAuthQuery } from "@/lib/auth-server";
import { api, type Id } from "@/lib/api";
import { ErrorState } from "@/components/ui/ErrorState";
import {
  AreasOfServiceClient,
  type DepartmentTile,
  type PausedTile,
  type ClanTile,
} from "./AreasOfServiceClient";
import { departmentIconKey } from "@klt-cyber/shared";
import { canEnterDepartment, departmentHref } from "@/lib/departmentRoutes";

const OFFLINE_FALLBACK = (
  <div className="flex min-h-dvh items-center justify-center bg-background">
    <ErrorState cause="offline" />
  </div>
);

export default async function AreasOfServicePage() {
  let account;
  try {
    account = await fetchAuthQuery(api.profile.getMyAccount);
  } catch {
    return OFFLINE_FALLBACK;
  }
  if (!account) redirect("/sign-in");

  const { user, activeRoles } = account;

  let hubData;
  try {
    hubData = await fetchAuthQuery(
      api.departmentMemberships.listMyDepartmentsForHub
    );
  } catch {
    return OFFLINE_FALLBACK;
  }

  if (!hubData) {
    redirect("/unauthorized");
  }

  const departments: DepartmentTile[] = hubData.active.map(
    ({ department, roles, isSystemAdmin }) => ({
      id: department._id,
      name: department.name,
      description: department.description ?? null,
      // `null` for a department with no pages for this caller, which renders
      // the tile as a plain card rather than a link. Being on a roster is not
      // enough to enter (see `canEnterDepartment`), and a tile that led to a
      // layout which turned you around would send you straight back to this
      // very page.
      href: canEnterDepartment(roles, isSystemAdmin)
        ? departmentHref(department.name)
        : null,
      // Each department's own fixed mark, the same one its portal header shows
      // (AC-7). Resolved from the shared name-to-key map, so a department added
      // later with no entry gets the fallback rather than an empty square.
      iconKey: departmentIconKey(department.name),
    })
  );

  const pausedTiles: PausedTile[] = hubData.paused.map(({ department }) => ({
    id: department._id,
    name: department.name,
    iconKey: departmentIconKey(department.name),
  }));

  const clanIds = [
    ...new Set(
      activeRoles
        .filter((role) => role.roleType === "clan_elder" && role.clanId)
        .map((role) => role.clanId as Id<"clans">)
    ),
  ];
  let clans;
  try {
    clans = clanIds.length > 0 ? await fetchAuthQuery(api.clans.listClans) : [];
  } catch {
    return OFFLINE_FALLBACK;
  }
  const clanNameById = new Map(clans.map((clan) => [clan._id, clan.name]));

  const clanTiles: ClanTile[] = activeRoles
    .filter((role) => role.roleType === "clan_elder")
    .map((role) => ({
      id: role._id,
      clanName: clanNameById.get(role.clanId as Id<"clans">) ?? "—",
      href: `/elder/${role.clanId}`,
    }));

  if (
    departments.length === 0 &&
    pausedTiles.length === 0 &&
    clanTiles.length === 0
  ) {
    redirect("/unauthorized");
  }

  const displayName = user.firstName ?? user.email;
  const isSystemAdmin = activeRoles.some(
    (role) => role.roleType === "system_admin"
  );

  return (
    <AreasOfServiceClient
      displayName={displayName}
      departments={departments}
      pausedDepartments={pausedTiles}
      clans={clanTiles}
      isSystemAdmin={isSystemAdmin}
    />
  );
}
