import { cn } from "@/lib/utils";
import { markFor } from "@/lib/serviceLogos";

/**
 * The vendor's mark for a cost register card (spec 0011).
 *
 * Sized in one place rather than per caller, because a grid of logos only
 * reads as a set when every tile is the same square whatever shape the mark
 * inside it happens to be.
 *
 * The tile is the brand's own colour at a tenth opacity, which is the one way
 * to seat fourteen unrelated logos (a red, an orange, two blacks, a navy) on
 * warm parchment without any of them shouting. A vendor with no published mark
 * gets a monogram on a neutral surface token instead: inventing a colour for
 * somebody else's brand would be a quiet untruth about their identity.
 *
 * The mark is `aria-hidden` throughout. It sits beside the service name, so
 * announcing it would read the same name twice.
 */
export function ServiceLogo({
  service,
  className,
}: {
  service: { serviceKey?: string; name: string };
  className?: string;
}) {
  const mark = markFor(service);

  const tile = cn(
    "flex size-11 shrink-0 items-center justify-center rounded-md",
    className,
  );

  if (!mark.path || !mark.color) {
    return (
      <div
        className={cn(tile, "bg-surface-high")}
        aria-hidden
        title={mark.label}
      >
        <span className="font-body text-sm font-bold tracking-tight text-on-surface-variant">
          {mark.monogram}
        </span>
      </div>
    );
  }

  return (
    <div
      className={tile}
      // The brand colour at 10% — see the note above on why this is the one
      // component allowed a colour from outside the palette.
      style={{ backgroundColor: `${mark.color}1a` }}
      aria-hidden
      title={mark.label}
    >
      <svg
        viewBox="0 0 24 24"
        className="size-6"
        role="presentation"
        focusable="false"
      >
        <path d={mark.path} fill={mark.color} />
      </svg>
    </div>
  );
}
