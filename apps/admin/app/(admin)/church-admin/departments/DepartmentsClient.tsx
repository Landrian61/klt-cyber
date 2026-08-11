"use client";

import { useRouter } from "next/navigation";
import { useAuthQuery } from "@/lib/useAuthQuery";
import { api } from "@/lib/api";
import { Card } from "../ui";

export function DepartmentsClient() {
  const router = useRouter();
  const departments = useAuthQuery(api.departments.listDepartments);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="font-display text-2xl font-semibold">Departments</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          The 13 fixed Areas of Service.
        </p>
      </div>

      <Card className="overflow-hidden p-0">
        {departments === undefined && (
          <div className="flex flex-col gap-px">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-16 animate-pulse bg-muted" />
            ))}
          </div>
        )}

        {departments?.length === 0 && (
          <p className="p-8 text-center text-sm text-muted-foreground">
            No departments found yet.
          </p>
        )}

        {departments?.map((dept, i) => (
          <div
            key={dept._id}
            role="button"
            tabIndex={0}
            onClick={() => router.push(`/church-admin/departments/${dept._id}`)}
            className={`flex cursor-pointer items-center justify-between p-4 transition-colors hover:bg-muted/40 ${
              i > 0 ? "border-t border-border" : ""
            }`}
          >
            <div>
              <p className="text-sm font-medium">{dept.name}</p>
            </div>
            <p className="text-xs text-muted-foreground">
              Order {dept.order}
            </p>
          </div>
        ))}
      </Card>
    </div>
  );
}
