import { describe, expect, it } from 'vitest';

import {
  extractRadioListenerPass,
  isRadioListenerPass,
  withRadioListenerPass,
} from '../radio';

// Made up passes: a real one must never be committed.
const PASS = 'authn9999eeee8888ffff7777aaaa6666bbbb';
const OLD = 'authn0000aaaa1111bbbb2222cccc3333dddd';

describe('extractRadioListenerPass', () => {
  it("reads the pass from the page's own streamUrl first", () => {
    const page = `<a href="players_links.php?auth=${OLD}&type=pls"></a>
      <script>var streamUrl = 'http://h.example:43348/listen.mp3?${PASS}';</script>`;
    expect(extractRadioListenerPass(page)).toBe(PASS);
  });

  it('falls back to any pass on the page, and null without one', () => {
    expect(extractRadioListenerPass(`players_links.php?auth=${OLD}&type=pls`)).toBe(OLD);
    expect(extractRadioListenerPass('<html>Page not found</html>')).toBeNull();
  });
});

describe('isRadioListenerPass', () => {
  it('accepts only the authn plus hex shape', () => {
    expect(isRadioListenerPass(PASS)).toBe(true);
    expect(isRadioListenerPass('authn12')).toBe(false);
    expect(isRadioListenerPass(`${PASS}&x=1`)).toBe(false);
  });
});

describe('withRadioListenerPass', () => {
  const env = `https://h.example:43348/listen.mp3?${OLD}`;

  it('replaces the typed pass, or adds one', () => {
    expect(withRadioListenerPass(env, PASS)).toBe(`https://h.example:43348/listen.mp3?${PASS}`);
    expect(withRadioListenerPass('https://h.example/listen.mp3', PASS)).toBe(
      `https://h.example/listen.mp3?${PASS}`,
    );
  });

  it('keeps other query parameters and a fragment', () => {
    expect(withRadioListenerPass(`https://h.example/listen.mp3?${OLD}&nocache=1#x`, PASS)).toBe(
      `https://h.example/listen.mp3?${PASS}&nocache=1#x`,
    );
  });

  it('leaves the url alone without a well formed pass or a url', () => {
    expect(withRadioListenerPass(env, null)).toBe(env);
    expect(withRadioListenerPass(env, 'x&evil=1')).toBe(env);
    expect(withRadioListenerPass('not a url', PASS)).toBe('not a url');
  });
});
