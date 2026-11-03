"use client";

import { DepartmentShellGate } from "@/components/department/DepartmentShellProvider";
import { LibraryItemsPage } from "@/components/library/LibraryItemsPage";

/**
 * The Library's catalogue (spec 0015, AC-5).
 *
 * Gated on `manageLibrary`, which only `Library & Information` grants — so for
 * every other department this route is a NOT FOUND rather than an empty page.
 * Library is the first department to put a page on the shared `[slug]` shell
 * that only it can open, and this is the pattern Hospitality and Real Estate
 * will follow.
 */
export default function LibraryCataloguePage() {
  return (
    <DepartmentShellGate requires="manageLibrary">
      {() => <LibraryItemsPage scope="all" />}
    </DepartmentShellGate>
  );
}
