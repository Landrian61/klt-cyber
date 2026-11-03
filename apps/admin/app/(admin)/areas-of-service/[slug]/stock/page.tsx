"use client";

import { DepartmentShellGate } from "@/components/department/DepartmentShellProvider";
import { LibraryStockPage } from "@/components/library/LibraryStockPage";

/** What is on the shelf, and every movement behind it (AC-22 to AC-25). */
export default function LibraryStockRoutePage() {
  return (
    <DepartmentShellGate requires="manageLibrary">
      {() => <LibraryStockPage />}
    </DepartmentShellGate>
  );
}
