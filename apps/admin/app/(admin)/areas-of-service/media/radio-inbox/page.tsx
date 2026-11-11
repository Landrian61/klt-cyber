"use client";

import { DepartmentShellGate } from "@/components/department/DepartmentShellProvider";
import { RadioInboxPage } from "@/components/radio/RadioInboxPage";

/**
 * Media's Radio inbox (spec 0019, AC-29, AC-31). Gated on `manageRadio`. The
 * query behind it is also open to Pastoral's HOD and delegates, whose own page
 * is feature 19's to build on the same read (AC-38).
 */
export default function MediaRadioInboxPage() {
  return (
    <DepartmentShellGate requires="manageRadio">
      {() => <RadioInboxPage />}
    </DepartmentShellGate>
  );
}
