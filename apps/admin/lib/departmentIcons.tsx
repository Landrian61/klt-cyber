import {
  Baby,
  Building2,
  Coffee,
  Flame,
  Globe,
  GraduationCap,
  Hand,
  HeartHandshake,
  Library,
  Music,
  Radio,
  Shield,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import {
  DEPARTMENT_ICON_FALLBACK_KEY,
  departmentIconKey,
  type DepartmentIconKey,
} from "@klt-cyber/shared";

/**
 * The admin app's half of the department icon contract (spec 0012, AC-7).
 *
 * `@klt-cyber/shared` names each department's icon as a short string, because
 * it is imported by Convex (no React) and by mobile (a different icon set).
 * This map turns that string into the lucide component the portal renders, so
 * the hub card and the portal header always show the same mark.
 */
const ICONS: Record<DepartmentIconKey, LucideIcon> = {
  shield: Shield,
  "heart-handshake": HeartHandshake,
  wallet: Wallet,
  "graduation-cap": GraduationCap,
  radio: Radio,
  music: Music,
  hand: Hand,
  globe: Globe,
  coffee: Coffee,
  baby: Baby,
  flame: Flame,
  building: Building2,
  library: Library,
  [DEPARTMENT_ICON_FALLBACK_KEY]: Users,
};

/** The icon component for an icon key, falling back rather than rendering nothing. */
export function departmentIconFor(key: string): LucideIcon {
  return ICONS[key as DepartmentIconKey] ?? ICONS[DEPARTMENT_ICON_FALLBACK_KEY];
}

/** The icon component for a department name, for callers that have no key. */
export function departmentIconByName(name: string): LucideIcon {
  return departmentIconFor(departmentIconKey(name));
}
