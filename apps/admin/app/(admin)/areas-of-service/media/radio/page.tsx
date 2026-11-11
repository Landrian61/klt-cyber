"use client";

import { DepartmentShellGate } from "@/components/department/DepartmentShellProvider";
import { RadioPage } from "@/components/radio/RadioPage";

/**
 * Media's Radio page (spec 0019). Gated on `manageRadio`, which every
 * verified Media roster member holds alongside Media's leaders and a System
 * Admin. The Convex functions behind it re-check the same capability.
 */
export default function MediaRadioPage() {
  return (
    <DepartmentShellGate requires="manageRadio">
      {() => <RadioPage />}
    </DepartmentShellGate>
  );
}
