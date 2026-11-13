"use client";

import { useParams } from "next/navigation";
import { DepartmentShellGate } from "@/components/department/DepartmentShellProvider";
import { VisitorRecordPage } from "@/components/hospitality/VisitorRecordPage";
import type { Id } from "@/lib/api";

/**
 * One visitor's record (spec 0024, AC-2, AC-14).
 *
 * Gated on `manageHospitality` exactly like the list, so it is a not found
 * page on every other slug and for any caller without it. `getVisitor` and
 * every mutation the page calls re-check the same capability.
 */
export default function HospitalityVisitorRecordPage() {
  const { visitorId } = useParams<{ visitorId: string }>();
  return (
    <DepartmentShellGate requires="manageHospitality">
      {() => <VisitorRecordPage visitorId={visitorId as Id<"visitors">} />}
    </DepartmentShellGate>
  );
}
