import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Hammer } from "lucide-react";
import { fetchAuthQuery } from "@/lib/auth-server";
import { api, type Id } from "@/lib/api";

// Every department other than Administration lands here — none of them have
// a dedicated portal built yet (docs/Alignment.md marks that "Out of scope —
// Part 2"), so this is a deliberately plain "coming soon" skeleton rather
// than a real workspace. Access is still enforced server-side by
// getDepartmentAccess (System Admin, roster membership, or hod/department_admin
// for this specific department) — this page only redirects on the resulting
// error, it doesn't re-derive access itself.
export default async function DepartmentComingSoonPage({
  params,
}: {
  params: Promise<{ departmentId: string }>;
}) {
  const { departmentId } = await params;
  const id = departmentId as Id<"departments">;

  let departmentName: string;
  try {
    const access = await fetchAuthQuery(api.departmentMemberships.getDepartmentAccess, {
      departmentId: id,
    });
    departmentName = access.department.name;
  } catch {
    redirect("/areas-of-service");
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-background px-6 text-center">
      <Link
        href="/areas-of-service"
        className="absolute left-6 top-6 flex items-center gap-2 rounded-full px-4 py-2 font-body text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground md:left-10 md:top-8"
      >
        <ArrowLeft className="h-4 w-4" />
        Areas of Service
      </Link>

      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-secondary">
        <Hammer className="h-7 w-7 text-primary" />
      </div>

      <div>
        <h1 className="font-display text-2xl font-semibold text-on-surface">
          {departmentName}
        </h1>
        <p className="mt-2 font-body text-base text-muted-foreground">
          Coming soon.
        </p>
        <p className="mx-auto mt-3 max-w-sm font-body text-sm text-muted-foreground">
          This department&apos;s workspace hasn&apos;t been built yet. Check
          back soon.
        </p>
      </div>
    </div>
  );
}
