import { describe, expect, it } from "vitest";
import {
  RADIO_PASS_REFRESH_MS,
  RADIO_PASS_RETRY_MS,
  extractListenerPass,
  passRefreshDue,
  playableStreamUrl,
  withListenerPass,
} from "./radioPass";

const PASS = "authn9999eeee8888ffff7777aaaa6666bbbb";
const OLD = "authn0000aaaa1111bbbb2222cccc3333dddd";

describe("extractListenerPass", () => {
  it("reads the pass off the stream url on Caster FM's player page", () => {
    const page = `<a href="players_links.php?auth=${OLD}&type=pls"></a>
      <source src="http://shaincast.caster.fm:43348/listen.mp3?${PASS}" type="audio/mpeg">`;
    expect(extractListenerPass(page)).toBe(PASS);
  });

  it("falls back to any pass on the page, and null without one", () => {
    expect(extractListenerPass(`players_links.php?auth=${OLD}&type=pls`)).toBe(OLD);
    expect(extractListenerPass("<html>Page not found</html>")).toBeNull();
  });
});

describe("withListenerPass", () => {
  const env = `https://shaincast.caster.fm:43348/listen.mp3?${OLD}`;

  it("replaces the typed pass with the current one", () => {
    expect(withListenerPass(env, PASS)).toBe(
      `https://shaincast.caster.fm:43348/listen.mp3?${PASS}`
    );
    expect(withListenerPass("https://h.example/listen.mp3", PASS)).toBe(
      `https://h.example/listen.mp3?${PASS}`
    );
  });

  it("keeps any other query parameter", () => {
    expect(withListenerPass(`https://h.example/listen.mp3?${OLD}&nocache=1`, PASS)).toBe(
      `https://h.example/listen.mp3?${PASS}&nocache=1`
    );
  });

  it("leaves the url alone without a well formed pass", () => {
    expect(withListenerPass(env, undefined)).toBe(env);
    expect(withListenerPass(env, "x&evil=1")).toBe(env);
    expect(withListenerPass("not a url", PASS)).toBe("not a url");
  });
});

describe("playableStreamUrl", () => {
  const envUrl = `https://h.example/listen.mp3?${OLD}`;

  it("uses the stored pass only while a source page is set", () => {
    expect(playableStreamUrl({ envUrl, sourceUrl: "https://w.example/p", pass: PASS })).toBe(
      `https://h.example/listen.mp3?${PASS}`
    );
    // Unset: the env url as typed, so an operator can take over by hand.
    expect(playableStreamUrl({ envUrl, sourceUrl: undefined, pass: PASS })).toBe(envUrl);
    expect(playableStreamUrl({ envUrl: undefined, sourceUrl: "x", pass: PASS })).toBeNull();
  });
});

describe("passRefreshDue", () => {
  const base = {
    sourceUrl: "https://widgets.example/em_player.php",
    pass: PASS,
    checkedAt: 1_000,
    triedAt: 1_000,
    storedServerStart: "11/Nov/2026:21:39:37 -0500",
    serverStart: "11/Nov/2026:21:39:37 -0500",
    now: 1_000 + 60_000,
  };

  it("never runs without a source page", () => {
    expect(passRefreshDue({ ...base, sourceUrl: undefined, pass: undefined })).toBe(false);
  });

  it("runs with no pass yet, once the pass is old, and after a restart", () => {
    expect(passRefreshDue(base)).toBe(false);
    expect(passRefreshDue({ ...base, pass: undefined })).toBe(true);
    expect(passRefreshDue({ ...base, now: base.checkedAt + RADIO_PASS_REFRESH_MS })).toBe(true);
    expect(passRefreshDue({ ...base, serverStart: "12/Nov/2026:03:00:00 -0500" })).toBe(true);
  });

  it("runs when the stream refused the pass, but never twice inside a minute", () => {
    expect(passRefreshDue({ ...base, refused: true })).toBe(true);
    expect(
      passRefreshDue({ ...base, refused: true, triedAt: base.now - RADIO_PASS_RETRY_MS + 1 })
    ).toBe(false);
    expect(passRefreshDue({ ...base, pass: undefined, triedAt: base.now - 1_000 })).toBe(false);
  });

  it("does not treat stats it could not read as a restart", () => {
    expect(passRefreshDue({ ...base, serverStart: undefined })).toBe(false);
  });
});
