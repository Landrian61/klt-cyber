"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown, Loader2, Pause, Play, Radio, Volume2, VolumeX } from "lucide-react";
import {
  RADIO_NOTHING_ON_AIR_MESSAGE,
  RADIO_PLAY_ATTEMPT_TIMEOUT_MS,
  deriveRadioStatus,
  kampalaDateKeyAt,
  resolveCurrentBroadcast,
} from "@klt-cyber/shared";

import { api } from "@/lib/api";
import { useAuthQuery } from "@/lib/useAuthQuery";
import { cn } from "@/lib/utils";
import { Reveal } from "@/components/motion/Reveal";
import { Button } from "@/components/shadcn/button";

/** The status is derived on this clock, so a stalled probe hides the player (AC-39). */
const TICK_MS = 15_000;
/** How long "Nothing on air" stays before the player steps back. */
const MESSAGE_MS = 4_000;
const MINIMIZED_KEY = "klt.radio.portalPlayer.minimized";

/** The program photos the portal serves at /radio/<seedKey>.jpg (spec 0020). */
const HOSTED_ARTWORK = new Set([
  "morning-glory",
  "super-t",
  "midweek-service",
  "tongues-of-fire",
  "holy-ghost-night",
]);

type PlayerState = "idle" | "connecting" | "playing" | "nothing_on_air";

function artworkFor(b: { imageUrl: string | null; seedKey: string | null } | null): string {
  if (b?.imageUrl) return b.imageUrl;
  return `/radio/${b?.seedKey && HOSTED_ARTWORK.has(b.seedKey) ? b.seedKey : "default"}.jpg`;
}

function readMinimized(): string | null {
  try {
    return window.sessionStorage.getItem(MINIMIZED_KEY);
  } catch {
    return null;
  }
}

function writeMinimized(value: string | null) {
  try {
    if (value) window.sessionStorage.setItem(MINIMIZED_KEY, value);
    else window.sessionStorage.removeItem(MINIMIZED_KEY);
  } catch {
    // Without storage, minimizing lasts until the next page load. Harmless.
  }
}

/**
 * Reign Radio, listen only, across the whole portal (spec 0020, AC-1 to
 * AC-4). Mounted once in `app/(admin)/layout.tsx`, so it appears in every
 * module and keeps playing while someone moves between pages.
 *
 * It shows only while the derived status is Live, and stays while it is
 * playing whatever the status does, so its controls never vanish under the
 * person using them. It never plays on its own.
 *
 * It is never dismissed out of reach: minimizing folds it into a small LIVE
 * pill in the same corner, with the audio still playing, and the pill opens
 * it again. Minimized lasts for the current broadcast, so the next one
 * announces itself with the full card.
 *
 * Portal listening is never counted: this player sends no listening beats,
 * so stretches, listener figures, Radio Insights and the city counter stay app
 * only, as SRS 4.9 says.
 */
export function PortalRadioPlayer() {
  const nowPlaying = useAuthQuery(api.radio.getNowPlaying, {});
  const config = useAuthQuery(api.radio.getPlaybackConfig, {});
  const streamUrl = config?.streamUrl ?? null;

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(id);
  }, []);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const attemptRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const messageRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Each play gets an id. A stop moves it on, so a pending attempt the person
  // already cancelled cannot come back and report "Nothing on air".
  const attemptIdRef = useRef(0);
  const [state, setState] = useState<PlayerState>("idle");
  const [muted, setMuted] = useState(false);
  const [minimizedFor, setMinimizedFor] = useState<string | null>(null);
  useEffect(() => setMinimizedFor(readMinimized()), []);

  const status = nowPlaying ? deriveRadioStatus(nowPlaying.reading, now) : "off_air";
  const current = nowPlaying ? resolveCurrentBroadcast(nowPlaying.broadcasts, now) : null;
  // Minimizing lasts for this broadcast only (AC-4); an unscheduled stretch
  // on air is keyed by its Kampala day.
  const broadcastKey = current?._id ?? `live:${kampalaDateKeyAt(now)}`;

  const clearTimers = useCallback(() => {
    if (attemptRef.current) clearTimeout(attemptRef.current);
    if (messageRef.current) clearTimeout(messageRef.current);
    attemptRef.current = null;
    messageRef.current = null;
  }, []);

  /** Stop and drop the connection, so a paused tab is not still downloading. */
  const stop = useCallback(() => {
    attemptIdRef.current += 1;
    clearTimers();
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
    }
    if ("mediaSession" in navigator) navigator.mediaSession.playbackState = "none";
    setState("idle");
  }, [clearTimers]);

  const giveUp = useCallback(() => {
    stop();
    if (messageRef.current) clearTimeout(messageRef.current);
    setState("nothing_on_air");
    messageRef.current = setTimeout(() => setState("idle"), MESSAGE_MS);
  }, [stop]);

  const play = useCallback(() => {
    if (!streamUrl) {
      giveUp();
      return;
    }
    clearTimers();
    let audio = audioRef.current;
    if (!audio) {
      audio = new Audio();
      audio.preload = "none";
      audioRef.current = audio;
    }
    audio.muted = muted;
    // A fresh source every time, so a resume joins the live edge rather than
    // replaying a stale buffer.
    audio.src = streamUrl;
    const attempt = ++attemptIdRef.current;
    const failIfCurrent = () => {
      if (attemptIdRef.current === attempt) giveUp();
    };
    setState("connecting");
    audio.play().catch(failIfCurrent);
    attemptRef.current = setTimeout(failIfCurrent, RADIO_PLAY_ATTEMPT_TIMEOUT_MS);
  }, [streamUrl, muted, clearTimers, giveUp]);

  // What the audio element reports is the truth about playback.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onPlaying = () => {
      if (attemptRef.current) clearTimeout(attemptRef.current);
      attemptRef.current = null;
      setState("playing");
    };
    // Our own stop removes the source, which some browsers report as an
    // error; only a source that is still attached has really failed.
    const onEnded = () => {
      if (audio.getAttribute("src")) stop();
    };
    audio.addEventListener("playing", onPlaying);
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("error", onEnded);
    return () => {
      audio.removeEventListener("playing", onPlaying);
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("error", onEnded);
    };
  }, [state, stop]);

  useEffect(() => {
    if (audioRef.current) audioRef.current.muted = muted;
  }, [muted]);

  // Signing out, or leaving the portal, stops it (spec 0020, AC-8).
  useEffect(() => {
    if (nowPlaying === null && state !== "idle") stop();
  }, [nowPlaying, state, stop]);
  useEffect(() => () => stop(), [stop]);

  // The browser's own media panel names the program (AC-3).
  const title = current?.title ?? "Reign Radio";
  const host = current?.host ?? null;
  const artwork = artworkFor(current);
  useEffect(() => {
    if (!("mediaSession" in navigator) || state !== "playing") return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title,
      artist: host ? `${host} · Reign Radio` : "Reign Radio",
      album: "Live on Reign Radio",
      artwork: [{ src: artwork, sizes: "512x512", type: "image/jpeg" }],
    });
    navigator.mediaSession.playbackState = "playing";
    navigator.mediaSession.setActionHandler("play", play);
    navigator.mediaSession.setActionHandler("pause", stop);
    navigator.mediaSession.setActionHandler("stop", stop);
    return () => {
      for (const action of ["play", "pause", "stop"] as const) {
        navigator.mediaSession.setActionHandler(action, null);
      }
    };
  }, [state, title, host, artwork, play, stop]);

  const listening = state === "connecting" || state === "playing";
  const visible = listening || state === "nothing_on_air" || status === "live";
  if (!visible) return null;

  const minimize = () => {
    writeMinimized(broadcastKey);
    setMinimizedFor(broadcastKey);
  };
  const expand = () => {
    writeMinimized(null);
    setMinimizedFor(null);
  };

  // Minimized: a small pill in the same corner, so the player is always one
  // click away. A message ("Nothing on air") always shows on the full card.
  if (minimizedFor === broadcastKey && state !== "nothing_on_air") {
    return (
      <Reveal y={8} className="fixed right-4 bottom-4 z-40 sm:right-6 sm:bottom-6">
        <button
          type="button"
          onClick={expand}
          aria-label={
            listening ? `Open the Reign Radio player, playing ${title}` : "Open the Reign Radio player"
          }
          className="inline-flex h-12 items-center gap-2 rounded-full bg-surface-lowest py-2 pr-4 pl-2 shadow-e3 transition-[transform,box-shadow] duration-150 hover:-translate-y-px hover:shadow-e2 active:scale-95"
        >
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-crimson text-white">
            {listening ? (
              <span className="flex h-3.5 items-end gap-[2px]" aria-hidden>
                {[0, 150, 300].map((delay) => (
                  <span
                    key={delay}
                    className="w-[3px] rounded-full bg-white motion-safe:animate-pulse"
                    style={{ height: delay === 150 ? "100%" : "60%", animationDelay: `${delay}ms` }}
                  />
                ))}
              </span>
            ) : (
              <Radio className="h-4 w-4" aria-hidden />
            )}
          </span>
          <span className="font-body text-sm font-semibold text-on-surface">
            {status === "live" ? "Live" : "Reign Radio"}
          </span>
        </button>
      </Reveal>
    );
  }

  return (
    <Reveal
      y={12}
      className="fixed inset-x-4 bottom-4 z-40 sm:inset-x-auto sm:right-6 sm:bottom-6 sm:w-[380px]"
    >
      <section
        aria-label="Reign Radio player"
        className="flex items-center gap-3 rounded-2xl bg-surface-lowest p-3 shadow-e3"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={artwork}
          alt=""
          className="h-12 w-12 shrink-0 rounded-lg object-cover"
        />

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-body text-[10px] font-semibold uppercase tracking-wider",
                status === "live" ? "bg-crimson text-white" : "bg-primary text-on-primary",
              )}
            >
              <span
                className={cn(
                  "h-1.5 w-1.5 rounded-full",
                  status === "live" ? "bg-white motion-safe:animate-pulse" : "bg-on-primary",
                )}
                aria-hidden
              />
              {status === "live" ? "Live" : "Interrupted"}
            </span>
            <span className="truncate font-body text-xs text-on-surface-variant">Reign Radio</span>
          </div>
          <p className="truncate font-body text-sm font-semibold text-on-surface">{title}</p>
          <p className="truncate font-body text-xs text-on-surface-variant" aria-live="polite">
            {state === "nothing_on_air"
              ? RADIO_NOTHING_ON_AIR_MESSAGE
              : state === "connecting"
                ? "Connecting…"
                : (host ?? (state === "playing" ? "Listening live" : "On air now"))}
          </p>
        </div>

        <button
          type="button"
          onClick={listening ? stop : play}
          aria-label={listening ? "Stop Reign Radio" : `Listen to ${title}`}
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[image:linear-gradient(135deg,var(--color-primary),var(--color-primary-container))] text-on-primary shadow-gold-glow transition-[filter,transform] duration-150 hover:brightness-95 active:scale-95"
        >
          {state === "connecting" ? (
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
          ) : listening ? (
            <Pause className="h-5 w-5" aria-hidden />
          ) : (
            <Play className="ml-0.5 h-5 w-5" aria-hidden />
          )}
        </button>

        <div className="flex shrink-0 flex-col">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => setMuted((m) => !m)}
            aria-label={muted ? "Unmute" : "Mute"}
            aria-pressed={muted}
          >
            {muted ? <VolumeX className="h-4 w-4" aria-hidden /> : <Volume2 className="h-4 w-4" aria-hidden />}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={minimize}
            aria-label="Minimize the player"
          >
            <ChevronDown className="h-4 w-4" aria-hidden />
          </Button>
        </div>
      </section>
    </Reveal>
  );
}
