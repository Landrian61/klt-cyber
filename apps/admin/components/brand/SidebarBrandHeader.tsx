import Image from "next/image";
import Link from "next/link";
import { SidebarHeader } from "@/components/shadcn/sidebar";

/**
 * The header every sidebar in the portal shares: the KLT mark, the platform
 * name, and a caption naming which portal you are in.
 *
 * It was the same markup copied into four rails (Administration, System Admin,
 * Media, and every department), differing only in the link target and that
 * caption. One component means the platform name is written once: renaming it
 * is a one-line change here rather than four edits that drift.
 *
 * `KLT Cyber` is the platform's name. The church is Kingdom Life Tabernacle;
 * `KLT Cyber` is what this product is called, and it is short enough to leave
 * room for the caption underneath at the rail's width.
 *
 * The caption is what changes per portal: the department's own name in a
 * department portal, `Admin` in Administration's, `Admin Portal` in the System
 * Admin rail. Collapsed to the icon rail, only the mark remains.
 */
export function SidebarBrandHeader({
  href,
  caption,
}: {
  /** Where the mark links, normally that portal's landing page. */
  href: string;
  /** Which portal this is, in two or three words. */
  caption: string;
}) {
  return (
    <SidebarHeader className="p-3">
      <Link
        href={href}
        className="flex items-center gap-2.5 group-data-[collapsible=icon]:justify-center"
      >
        <Image
          src="/logo-circle-96.png"
          alt="KLT Cyber"
          width={36}
          height={36}
          className="h-9 w-9 shrink-0 rounded-full object-cover ring-1 ring-white/15"
        />
        <span className="flex min-w-0 flex-col leading-tight group-data-[collapsible=icon]:hidden">
          <span className="truncate font-body text-sm font-semibold text-white">
            KLT Cyber
          </span>
          <span className="truncate font-body text-[11px] uppercase tracking-[0.16em] text-sidebar-primary">
            {caption}
          </span>
        </span>
      </Link>
    </SidebarHeader>
  );
}
