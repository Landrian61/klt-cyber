import type { ReactNode } from "react";
import { MediaLeadersOnly } from "../MediaLeadersOnly";

/** Devotionals publish to the whole church, so they stay leaders only. */
export default function DevotionalsLayout({ children }: { children: ReactNode }) {
  return <MediaLeadersOnly>{children}</MediaLeadersOnly>;
}
