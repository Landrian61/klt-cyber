import type { ReactNode } from "react";
import { MediaLeadersOnly } from "../MediaLeadersOnly";

/** Past events publish to the whole church, so they stay leaders only. */
export default function PastEventsLayout({ children }: { children: ReactNode }) {
  return <MediaLeadersOnly>{children}</MediaLeadersOnly>;
}
