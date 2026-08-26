import { redirect } from "next/navigation";
import { fetchAuthQuery } from "@/lib/auth-server";
import { api, type Id } from "@/lib/api";
import {
  AreasOfServiceClient,
  type DepartmentTile,
  type ClanTile,
} from "./AreasOfServiceClient";

// The only Area of Service with a dedicated portal today — every other
// department gets the generic read-only overview page until its own portal
// ships (see docs/Alignment.md, "Out of scope — Part 2").
const ADMINISTRATION_DEPARTMENT_NAME = "Administration";

function departmentHref(departmentName: string, departmentId: Id<"departments">) {
  return departmentName === ADMINISTRATION_DEPARTMENT_NAME
    ? "/admin"
    : `/departments/${departmentId}`;
}

// Post-login landing for every minister with ≥1 Area of Service or clan_elder
// assignment (docs/Alignment.md, "Part 2"). System Admin sees every seeded
// department, full access, no separate System Admin tile here — that portal
// is reached from inside a department (System Admin Sidebar/TopBar "Areas of
// Service" link goes the other way) or by direct navigation to /system-admin.
export default async function AreasOfServicePage() {
  const account = await fetchAuthQuery(api.profile.getMyAccount);
  if (!account) redirect("/sign-in");

  const { user, activeRoles } = account;

  // The web portal authorization invariant (docs/DATA_MODEL.md): a portal
  // session is valid only when the caller holds >=1 active roleAssignments
  // record. Stated here in its canonical form rather than being inferred from
  // "no tiles to show" further down — this route previously leaned on
  // middleware for it, and middleware no longer performs the check.
  //
  // Checked before the queries below so a caller who fails it costs one Convex
  // round trip rather than three.
  if (activeRoles.length === 0) {
    redirect("/unauthorized");
  }

  // Null if the session lapsed between the account fetch and this one — treat
  // it as "no departments", which falls through to the /unauthorized redirect
  // below rather than crashing the render.
  const myDepartments =
    (await fetchAuthQuery(api.departmentMemberships.listMyDepartments)) ?? [];
  const departments: DepartmentTile[] = myDepartments.map(({ department }) => ({
    id: department._id,
    name: department.name,
    description: department.description ?? null,
    href: departmentHref(department.name, department._id),
  }));

  // clan_elder is a separate, still-valid concept from Areas of Service —
  // kept as its own section rather than folded into the department grid.
  const clanIds = [
    ...new Set(
      activeRoles
        .filter((role) => role.roleType === "clan_elder" && role.clanId)
        .map((role) => role.clanId as Id<"clans">)
    ),
  ];
  const clans =
    clanIds.length > 0 ? await fetchAuthQuery(api.clans.listClans) : [];
  const clanNameById = new Map(clans.map((clan) => [clan._id, clan.name]));

  const clanTiles: ClanTile[] = activeRoles
    .filter((role) => role.roleType === "clan_elder")
    .map((role) => ({
      id: role._id,
      clanName: clanNameById.get(role.clanId as Id<"clans">) ?? "—",
      href: `/elder/${role.clanId}`,
    }));

  // Secondary guard, not the invariant: a role-holder should always have at
  // least one tile (system_admin sees all 13; hod/department_admin are added
  // to their department's roster by assignRoleCore; clan_elder gets a clan
  // tile), so reaching here means something is inconsistent. Kept so that
  // case lands on /unauthorized rather than an empty screen.
  if (departments.length === 0 && clanTiles.length === 0) {
    redirect("/unauthorized");
  }

  const displayName = user.firstName ?? user.email;
  const isSystemAdmin = activeRoles.some((role) => role.roleType === "system_admin");

  return (
    <AreasOfServiceClient
      displayName={displayName}
      departments={departments}
      clans={clanTiles}
      isSystemAdmin={isSystemAdmin}
    />
  );
}
