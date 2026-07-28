import { redirect } from "next/navigation";
import { fetchAuthQuery } from "@/lib/auth-server";
import { api, type Id } from "@/lib/api";
import { SelectRoleClient, type RoleChoice } from "./SelectRoleClient";

// Extend as new roleTypes ship (docs/DATA_MODEL.md, Increment 2).
const ROLE_LABELS: Record<string, string> = {
  system_admin: "System Administrator",
};

function rolePrefix(roleType: string, clanId?: Id<"clans">) {
  if (roleType === "system_admin") return "/system-admin";
  if (roleType === "clan_elder") return `/elder/${clanId}`;
  return "/select-role";
}

// Shown after every sign-in for a user with ≥1 active role assignment.
// Defense in depth against a middleware bypass: 0 roles still redirect here.
// This server component resolves identity + roles, then hands the immersive
// Kingdom Radiant picker (SelectRoleClient) the serializable choices.
export default async function SelectRolePage() {
  const account = await fetchAuthQuery(api.profile.getMyAccount);
  if (!account) redirect("/sign-in");

  const { user, activeRoles } = account;
  if (activeRoles.length === 0) {
    redirect("/unauthorized");
  }

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

  const displayName = user.firstName ?? user.email;

  const roles: RoleChoice[] = activeRoles.map((role) => ({
    id: role._id,
    label:
      role.roleType === "clan_elder"
        ? `Elder of Clan ${clanNameById.get(role.clanId as Id<"clans">) ?? "—"}`
        : (ROLE_LABELS[role.roleType] ?? role.roleType),
    href: rolePrefix(role.roleType, role.clanId),
  }));

  return <SelectRoleClient displayName={displayName} roles={roles} />;
}
