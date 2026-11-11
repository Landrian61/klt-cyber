import { getCloudflareContext } from "@opennextjs/cloudflare";

/**
 * Which city the caller is in, for the radio's city counter (spec 0019,
 * AC-16, Value sourcing). Read from Cloudflare's own `request.cf.city`, which
 * the Worker receives on every request at no cost and with no third party.
 *
 * Public and unauthenticated on purpose: it says nothing about anyone but the
 * caller, and stores nothing. The phone asks once per app session and passes
 * the answer along with its beats. Local development has no `cf` object at
 * all, and a failure costs city data and nothing more, so every miss answers
 * `{}` rather than an error.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  let city: string | undefined;
  try {
    const raw = getCloudflareContext().cf?.city;
    if (typeof raw === "string" && raw.trim()) city = raw.trim().slice(0, 80);
  } catch {
    // No Cloudflare context (local `next dev`): no city.
  }
  return Response.json(city ? { city } : {}, {
    headers: { "Cache-Control": "private, no-store" },
  });
}
