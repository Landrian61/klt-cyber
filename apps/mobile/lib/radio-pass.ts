import {
  RADIO_PASS_FETCH_TIMEOUT_MS,
  extractRadioListenerPass,
  withRadioListenerPass,
} from '@klt-cyber/shared';

import { Sentry } from '@/lib/sentry';

/**
 * The live stream url with this phone's own listener pass (spec 0019,
 * amended 2026-11-14).
 *
 * Caster FM's pass works only from the internet address that fetched it, so
 * the server cannot read one for us: the phone reads Caster FM's player page
 * itself, on its own connection, just before it plays. A phone that moves
 * from Wi-Fi to mobile data gets a new address and needs a new pass, which is
 * why this runs on every play rather than being kept.
 *
 * Never throws. When the page cannot be read in time, or carries no pass, it
 * returns `streamUrl` as the server gave it, so a deployment whose stream
 * needs no pass still plays.
 */
export async function resolveRadioStreamUrl(
  streamUrl: string,
  passSourceUrl: string | null | undefined,
): Promise<string> {
  if (!passSourceUrl) return streamUrl;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), RADIO_PASS_FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(passSourceUrl, {
      headers: { Accept: 'text/html' },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`pass page answered ${response.status}`);
    const pass = extractRadioListenerPass(await response.text());
    if (!pass) throw new Error('pass page carried no pass');
    return withRadioListenerPass(streamUrl, pass);
  } catch (error) {
    // Sent as an event, not a breadcrumb: a breadcrumb goes out only with a
    // later exception, and a page Caster FM changed would then never show.
    // An abort is this phone's slow connection, not a broken page.
    if (!(error instanceof Error && error.name === 'AbortError')) {
      Sentry.captureMessage(
        `Radio listener pass not read, playing the url as given: ${
          error instanceof Error ? error.message : String(error)
        }`,
        { level: 'warning', tags: { fn: 'radio.resolvePass' } },
      );
    }
    return streamUrl;
  } finally {
    clearTimeout(timer);
  }
}
