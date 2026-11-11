/**
 * The caller's city, for the radio's city counter (spec 0019, AC-16).
 *
 * Asked once per app session from the portal's `/api/where`, which reads
 * Cloudflare's own `request.cf.city`. Kept in memory only, never stored on
 * the phone. Any failure, or a lookup url the deployment does not set,
 * answers undefined, which leaves the counter untouched and costs nothing
 * else: the radio never waits on this.
 */

const LOOKUP_TIMEOUT_MS = 5_000;

let pending: Promise<string | undefined> | null = null;
let pendingFor: string | null = null;

async function lookup(url: string): Promise<string | undefined> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LOOKUP_TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) return undefined;
    const body = (await response.json()) as { city?: unknown };
    return typeof body.city === 'string' && body.city.trim() ? body.city.trim() : undefined;
  } catch {
    return undefined;
  } finally {
    clearTimeout(timer);
  }
}

/** The city for this session, looked up at most once per lookup url. */
export function getRadioCity(lookupUrl: string | undefined): Promise<string | undefined> {
  if (!lookupUrl) return Promise.resolve(undefined);
  if (!pending || pendingFor !== lookupUrl) {
    pendingFor = lookupUrl;
    const attempt = lookup(lookupUrl);
    pending = attempt;
    // A miss (offline, a timeout) is tried again on the next play rather
    // than kept for the whole session.
    attempt.then((city) => {
      if (!city && pending === attempt) pending = null;
    });
  }
  return pending;
}
