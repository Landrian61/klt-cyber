import { redirect } from "next/navigation";
import Link from "next/link";
import { fetchAuthQuery } from "@/lib/auth-server";
import { api, type Id } from "@/lib/api";
import { Card } from "@/components/ui/Card";
import { Heading } from "@/components/ui/Heading";

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
export default async function SelectRolePage() {
  const { user, activeRoles } = await fetchAuthQuery(api.profile.getMyAccount);

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
  const clans = clanIds.length > 0 ? await fetchAuthQuery(api.clans.listClans) : [];
  const clanNameById = new Map(clans.map((clan) => [clan._id, clan.name]));

  const displayName = user.firstName ?? user.email;

  return (
    <div className="mx-auto max-w-xl">
      <Card className="p-8">
        <Heading as="h1" size="xl">
          Welcome, {displayName}. Choose a role to continue.
        </Heading>
        <p className="mt-1.5 font-body text-base text-on-surface-variant">
          {activeRoles.length > 1
            ? "You hold multiple administrative roles on this portal."
            : "Continue into your administrative role."}
        </p>

        <ul className="mt-8 space-y-3">
          {activeRoles.map((role) => {
            const label =
              role.roleType === "clan_elder"
                ? `Elder of Clan ${clanNameById.get(role.clanId as Id<"clans">) ?? "—"}`
                : (ROLE_LABELS[role.roleType] ?? role.roleType);

            return (
              <li key={role._id}>
                <Link
                  href={rolePrefix(role.roleType, role.clanId)}
                  className="flex items-center justify-between rounded-lg bg-surface-low p-4 transition-colors hover:bg-primary-light"
                >
                  <span className="font-body text-base font-medium text-on-surface">
                    {label}
                  </span>
                  <span className="font-body text-sm font-semibold text-primary">
                    Continue →
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </Card>
    </div>
  );
}
