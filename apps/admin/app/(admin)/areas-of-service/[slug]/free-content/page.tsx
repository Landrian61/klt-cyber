"use client";

import { DepartmentShellGate } from "@/components/department/DepartmentShellProvider";
import { LibraryItemsPage } from "@/components/library/LibraryItemsPage";

/** The free PDFs and recordings the congregation opens in the app (AC-18, AC-19). */
export default function LibraryFreeContentPage() {
  return (
    <DepartmentShellGate requires="manageLibrary">
      {() => <LibraryItemsPage scope="free" />}
    </DepartmentShellGate>
  );
}
