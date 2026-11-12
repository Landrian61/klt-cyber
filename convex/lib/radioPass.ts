/**
 * The stream's listener pass (spec 0019, Value sourcing amendment).
 *
 * Caster FM's stream refuses a listener without a pass in the query string
 * (`listen.mp3?authn<hex>`), and Caster FM changes which pass it accepts, on a
 * server restart and on its own schedule besides (seen on 2026-11-12: two
 * passes taking turns hours apart, each refused while the other worked). A
 * pass typed once into `RADIO_STREAM_URL` therefore goes stale, and every
 * player gets a 401 while the status still reads Live, since the statistics
 * page needs no pass.
 *
 * So the probe re-reads the current pass from Caster FM's own player page
 * (`RADIO_PASS_SOURCE_URL`) when the server restarts or the stored pass is
 * old, and players are handed `RADIO_STREAM_URL` with that pass in place of
 * whatever query it was typed with. With `RADIO_PASS_SOURCE_URL` unset,
 * nothing here runs and `RADIO_STREAM_URL` is used exactly as written.
 */

// How long a stored pass is trusted before the player page is read again.
// Short, because a pass can stop working at any time and nothing else tells
// the server except the stream refusing it, which the minute probe also
// checks. One small page read every two minutes.
export const RADIO_PASS_REFRESH_MS = 2 * 60_000;

/** Caster FM's pass shape: `authn` and a hex token. */
const PASS_PATTERN = /\bauthn[0-9a-f]{16,64}\b/i;

/**
 * The pass on a player page, or null when the page carries none. Prefers one
 * attached to the stream url itself, then any pass on the page.
 */
export function extractListenerPass(page: string): string | null {
  const onStream = /listen\.mp3\?(authn[0-9a-f]{16,64})\b/i.exec(page);
  if (onStream) return onStream[1];
  const anywhere = PASS_PATTERN.exec(page);
  return anywhere ? anywhere[0] : null;
}

/** True for a string shaped like a pass, so nothing else lands in a url. */
export function isListenerPass(value: string): boolean {
  return /^authn[0-9a-f]{16,64}$/i.test(value);
}

/**
 * `streamUrl` with `pass` in place of any pass it was typed with. Any other
 * query parameter is kept. Unchanged when there is no pass, the pass is
 * malformed, or the url does not parse.
 */
export function withListenerPass(streamUrl: string, pass: string | undefined): string {
  if (!pass || !isListenerPass(pass)) return streamUrl;
  try {
    const url = new URL(streamUrl);
    const others = url.search
      .replace(/^\?/, "")
      .split("&")
      .filter((part) => part !== "" && !/^authn[0-9a-f]*$/i.test(part));
    url.search = `?${[pass, ...others].join("&")}`;
    return url.toString();
  } catch {
    return streamUrl;
  }
}

/**
 * The url players open and the probe checks. The stored pass is used only
 * while `RADIO_PASS_SOURCE_URL` is set: unset, `RADIO_STREAM_URL` is used
 * exactly as written, so an operator can always take over by hand.
 */
export function playableStreamUrl(opts: {
  envUrl: string | undefined;
  sourceUrl: string | undefined;
  pass: string | undefined;
}): string | null {
  if (!opts.envUrl) return null;
  if (!opts.sourceUrl) return opts.envUrl;
  return withListenerPass(opts.envUrl, opts.pass);
}

// The least time between two reads of the player page, failed ones included.
// Just under a minute, so the next minute's cron run is never the one skipped.
export const RADIO_PASS_RETRY_MS = 50_000;

/**
 * Whether the probe should read the player page this run. Needs a source,
 * and at least a minute since the last attempt (so a page that fails is not
 * read on every burst probe). Then due when there is no pass yet, the stored
 * one is old, the stream refused it, or the stream server restarted since it
 * was read.
 */
export function passRefreshDue(opts: {
  sourceUrl: string | undefined;
  pass: string | undefined;
  checkedAt: number | undefined;
  triedAt: number | undefined;
  storedServerStart: string | undefined;
  serverStart: string | undefined;
  refused?: boolean;
  now: number;
}): boolean {
  if (!opts.sourceUrl) return false;
  if (opts.triedAt !== undefined && opts.now - opts.triedAt < RADIO_PASS_RETRY_MS) return false;
  if (opts.refused) return true;
  if (!opts.pass || opts.checkedAt === undefined) return true;
  if (opts.now - opts.checkedAt >= RADIO_PASS_REFRESH_MS) return true;
  return (
    opts.serverStart !== undefined &&
    opts.storedServerStart !== undefined &&
    opts.serverStart !== opts.storedServerStart
  );
}
