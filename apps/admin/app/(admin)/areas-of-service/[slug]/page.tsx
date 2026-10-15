import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Hammer } from "lucide-react";
import { fetchAuthQuery } from "@/lib/auth-server";
import { api } from "@/lib/api";
import { ErrorState } from "@/components/ui/ErrorState";
import { slugify } from "@/lib/slugify";

const PORTAL_DEFAULTS: Record<string, string> = {
  media: "/areas-of-service/media/devotionals",
};

export default async function DepartmentEntryPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const defaultPage = PORTAL_DEFAULTS[slug];
  if (defaultPage) {
    redirect(defaultPage);
  }

  let departmentName: string | null = null;
  try {
    const departments = await fetchAuthQuery(
      api.departmentMemberships.listMyDepartments,
    );
    if (departments) {
      const match = departments.find(
        ({ department }) => slugify(department.name) === slug,
      );
      if (match) {
        departmentName = match.department.name;
      }
    }
  } catch {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background">
        <ErrorState cause="offline" />
      </div>
    );
  }

  if (!departmentName) {
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
