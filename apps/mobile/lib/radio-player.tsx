import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useMutation, useQuery } from 'convex/react';
import { ConvexError } from 'convex/values';
import {
  setAudioModeAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
  type AudioMetadata,
} from 'expo-audio';
import { RADIO_BEAT_INTERVAL_MS, RADIO_PLAY_ATTEMPT_TIMEOUT_MS } from '@klt-cyber/shared';

import { api } from '@/lib/api';
import { useRadioNow } from '@/hooks/use-radio-now';
import { radioRemoteArtworkUrl } from '@/lib/radio-artwork';
import { Sentry } from '@/lib/sentry';
import { getDeviceId } from '@/lib/device-id';
import { getRadioCity } from '@/lib/radio-city';

function reportError(error: unknown, tags: { fn: string }) {
  Sentry.captureException(error, { tags });
}

/**
 * The one Reign Radio player (spec 0019, AC-1, AC-2, AC-4; spec 0020).
 *
 * Mounted once at the root, so the Radio tab, Home's Live now card, the
 * recordings list and the mini player on every other screen all drive the same
 * player. There is exactly one: two players on one live stream would fight
 * over the lock screen and the audio session.
 *
 * Background audio: the audio session is set to keep playing in the
 * background, iOS gets its `audio` background mode from app.config.ts, and
 * Android runs expo-audio's own media playback foreground service once the
 * player is made the lock screen player. That last call is load bearing, not
 * cosmetic: without a foreground service Android stops background audio
 * within minutes (spec 0019, Consequences).
 */

export type RadioPlayerState =
  /** Not playing, and nothing to say about it. */
  | 'idle'
  /** Play was tapped; waiting for the first audio. */
  | 'connecting'
  | 'playing'
  /** A recording held where it stopped, ready to resume (spec 0020). */
  | 'paused'
  /** No audio arrived within eight seconds (AC-4). Not an error screen. */
  | 'nothing_on_air'
  /** A recording would not load (an expired link, a dropped connection). */
  | 'unavailable';

/**
 * What the one player is pointed at. A recording (AC-27) goes through the
 * same player as the live stream, so there is still only one lock screen
 * owner and one audio session; starting either stops the other.
 */
export type RadioPlayerSource =
  | { kind: 'live' }
  | {
      kind: 'recording';
      broadcastId: string;
      title: string;
      subtitle: string | null;
      url: string;
      imageUrl: string | null;
      seedKey: string | null;
    };

type RecordingInput = Omit<Extract<RadioPlayerSource, { kind: 'recording' }>, 'kind'>;

interface RadioPlayerContextValue {
  state: RadioPlayerState;
  source: RadioPlayerSource;
  /** False until the stream url has arrived from Convex. */
  ready: boolean;
  /** Seconds into a recording, and its length; zero for the live stream. */
  position: number;
  duration: number;
  play: () => void;
  playRecording: (recording: RecordingInput) => void;
  /** Pause a recording in place; the live stream stops instead (spec 0020). */
  pause: () => void;
  /** Resume a paused recording from where it stopped. */
  resume: () => void;
  stop: () => void;
}

const LIVE: RadioPlayerSource = { kind: 'live' };

const RadioPlayerContext = createContext<RadioPlayerContextValue>({
  state: 'idle',
  source: LIVE,
  ready: false,
  position: 0,
  duration: 0,
  play: () => {},
  playRecording: () => {},
  pause: () => {},
  resume: () => {},
  stop: () => {},
});

export function useRadioPlayer(): RadioPlayerContextValue {
  return useContext(RadioPlayerContext);
}

/** True while the player has something to show: playing, starting, or a held recording. */
export function isRadioPlayerActive(state: RadioPlayerState): boolean {
  return state === 'playing' || state === 'connecting' || state === 'paused';
}

const LOCK_SCREEN_OPTIONS = { showSeekForward: false, showSeekBackward: false };
const RECORDING_LOCK_SCREEN_OPTIONS = { showSeekForward: true, showSeekBackward: true };

/** A recording that has not started within this long reads as unavailable. */
const RECORDING_LOAD_TIMEOUT_MS = 15_000;

/** A recording this close to its end, when it stops, has finished rather than paused. */
const RECORDING_END_SLACK_S = 1.5;

export function RadioPlayerProvider({ children }: { children: ReactNode }) {
  const config = useQuery(api.radio.getPlaybackConfig, {});
  const streamUrl = config?.streamUrl ?? null;
  const artworkBaseUrl = config?.artworkBaseUrl;

  // Created with no source: the stream is attached on each play, so a resume
  // after a pause rejoins the live edge instead of replaying a stale buffer.
  const player = useAudioPlayer(null);
  const status = useAudioPlayerStatus(player);

  const [state, setState] = useState<RadioPlayerState>('idle');
  const [source, setSource] = useState<RadioPlayerSource>(LIVE);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lockScreenActive = useRef(false);
  // Set by our own pause until the native status catches up, so the moment
  // where the status still says playing is not read as a resume.
  const pausingRef = useRef(false);

  // Half a minute is enough for the card to follow a program change.
  const { current } = useRadioNow(30_000);

  // The notification and lock screen card (spec 0020, AC-7): the program as
  // the title, the host and the station as the subtitle, and artwork from a
  // web address the notification can actually load.
  const metadata = useMemo<AudioMetadata>(() => {
    if (source.kind === 'recording') {
      const artwork = radioRemoteArtworkUrl(source, artworkBaseUrl);
      return {
        title: source.title,
        artist: source.subtitle ? `${source.subtitle} · Reign Radio` : 'Reign Radio',
        albumTitle: 'Reign Radio recording',
        ...(artwork ? { artworkUrl: artwork } : {}),
      };
    }
    const artwork = radioRemoteArtworkUrl(current, artworkBaseUrl);
    return {
      title: current?.title ?? 'Reign Radio',
      artist: current?.host ? `${current.host} · Reign Radio` : 'Reign Radio · Live',
      albumTitle: 'Live on Reign Radio',
      ...(artwork ? { artworkUrl: artwork } : {}),
    };
  }, [current, source, artworkBaseUrl]);

  useEffect(() => {
    setAudioModeAsync({
      playsInSilentMode: true,
      shouldPlayInBackground: true,
      interruptionMode: 'doNotMix',
    }).catch((error) => reportError(error, { fn: 'radio.setAudioMode' }));
  }, []);

  const clearAttemptTimer = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const releaseLockScreen = useCallback(() => {
    if (!lockScreenActive.current) return;
    lockScreenActive.current = false;
    try {
      player.clearLockScreenControls();
    } catch (error) {
      reportError(error, { fn: 'radio.clearLockScreen' });
    }
  }, [player]);

  const stop = useCallback(() => {
    clearAttemptTimer();
    try {
      player.pause();
    } catch {
      // A player with no source yet has nothing to pause.
    }
    releaseLockScreen();
    setState('idle');
  }, [clearAttemptTimer, player, releaseLockScreen]);

  /** Wait for audio, and give up with `failure` if none arrives in time. */
  const armAttemptTimer = useCallback(
    (ms: number, failure: RadioPlayerState) => {
      clearAttemptTimer();
      timeoutRef.current = setTimeout(() => {
        timeoutRef.current = null;
        try {
          player.pause();
        } catch {
          // Nothing to pause.
        }
        setState((prev) => (prev === 'connecting' ? failure : prev));
      }, ms);
    },
    [clearAttemptTimer, player],
  );

  const play = useCallback(() => {
    // AC-4: playback is attempted in every status. With no stream url yet
    // (still loading, or the deployment is not configured) there is nothing
    // to attempt, which reads the same to a member as nothing on air.
    if (!streamUrl) {
      setState('nothing_on_air');
      return;
    }
    clearAttemptTimer();
    releaseLockScreen();
    setSource(LIVE);
    setState('connecting');
    try {
      player.replace({ uri: streamUrl });
      player.play();
    } catch (error) {
      reportError(error, { fn: 'radio.play' });
      setState('nothing_on_air');
      return;
    }
    armAttemptTimer(RADIO_PLAY_ATTEMPT_TIMEOUT_MS, 'nothing_on_air');
  }, [armAttemptTimer, clearAttemptTimer, player, streamUrl, releaseLockScreen]);

  // A recording (AC-27): the same player, pointed at the signed url.
  const playRecording = useCallback(
    (recording: RecordingInput) => {
      clearAttemptTimer();
      releaseLockScreen();
      setSource({ kind: 'recording', ...recording });
      setState('connecting');
      try {
        player.replace({ uri: recording.url });
        player.play();
      } catch (error) {
        reportError(error, { fn: 'radio.playRecording' });
        setState('unavailable');
        return;
      }
      armAttemptTimer(RECORDING_LOAD_TIMEOUT_MS, 'unavailable');
    },
    [armAttemptTimer, clearAttemptTimer, player, releaseLockScreen],
  );

  // Pause holds a recording where it is and keeps the lock screen card, as a
  // music app does. The live stream has no "where it is" worth holding, so it
  // stops, and the next play rejoins the live edge (spec 0020, AC-6).
  const pause = useCallback(() => {
    if (source.kind !== 'recording') {
      stop();
      return;
    }
    clearAttemptTimer();
    pausingRef.current = true;
    try {
      player.pause();
    } catch {
      // Nothing to pause.
    }
    setState('paused');
  }, [source.kind, stop, clearAttemptTimer, player]);

  const resume = useCallback(() => {
    if (source.kind !== 'recording' || state !== 'paused') return;
    pausingRef.current = false;
    setState('connecting');
    try {
      player.play();
    } catch (error) {
      reportError(error, { fn: 'radio.resume' });
      setState('unavailable');
      return;
    }
    armAttemptTimer(RECORDING_LOAD_TIMEOUT_MS, 'unavailable');
  }, [source.kind, state, player, armAttemptTimer]);

  // Audio arriving is what turns an attempt into playback, and what makes
  // this the lock screen player (AC-2). Audio stopping outside our own
  // controls (the lock screen, the notification, the stream ending) is read
  // here: a recording that stopped partway is paused, one at its end is done,
  // and the live stream is simply stopped.
  useEffect(() => {
    if (!status.playing) pausingRef.current = false;
    if (state === 'paused' && pausingRef.current) return;
    if ((state === 'connecting' || state === 'paused') && status.playing && !status.isBuffering) {
      clearAttemptTimer();
      setState('playing');
      return;
    }
    if (state === 'playing' && !status.playing && !status.isBuffering) {
      const finished =
        status.didJustFinish ||
        (status.duration > 0 && status.currentTime >= status.duration - RECORDING_END_SLACK_S);
      if (source.kind === 'recording' && !finished) {
        setState('paused');
        return;
      }
      releaseLockScreen();
      setState('idle');
    }
  }, [
    state,
    source.kind,
    status.playing,
    status.isBuffering,
    status.didJustFinish,
    status.currentTime,
    status.duration,
    clearAttemptTimer,
    releaseLockScreen,
  ]);

  useEffect(() => {
    if (state !== 'playing' && state !== 'paused') return;
    try {
      if (!lockScreenActive.current) {
        player.setActiveForLockScreen(
          true,
          metadata,
          source.kind === 'recording' ? RECORDING_LOCK_SCREEN_OPTIONS : LOCK_SCREEN_OPTIONS,
        );
        lockScreenActive.current = true;
      } else {
        player.updateLockScreenMetadata(metadata);
      }
    } catch (error) {
      reportError(error, { fn: 'radio.lockScreen' });
    }
  }, [state, metadata, player, source.kind]);

  // Signing out stops playback (spec 0020, AC-8). `null` is the signed out
  // answer; `undefined` is only still loading.
  useEffect(() => {
    if (config === null && state !== 'idle') stop();
  }, [config, state, stop]);

  // Listening time (spec 0019, AC-12): while live audio is actually playing,
  // and only then, beat every thirty seconds naming this device. Leaving the
  // playing state sends one last beat marked as stopping, which closes the
  // stretch. The server credits the time from its own clock; this sends no
  // figure. A recording is not a broadcast being listened to live, so it
  // never beats.
  const beat = useMutation(api.radio.beat);
  const cityLookupUrl = config?.cityLookupUrl;
  const isLive = source.kind === 'live';
  useEffect(() => {
    if (state !== 'playing' || !isLive) return;
    let active = true;
    let refused = false;
    let deviceId: string | null = null;
    let city: string | undefined;

    const send = async (stopped?: boolean) => {
      if (refused || !deviceId) return;
      try {
        await beat({ deviceId, ...(city ? { city } : {}), ...(stopped ? { stopped } : {}) });
      } catch (error) {
        if (error instanceof ConvexError && error.data?.code === 'RADIO_TOO_MANY_DEVICES') {
          // Over five devices on this broadcast: keep the audio, stop counting.
          refused = true;
          return;
        }
        // A dropped beat costs at most one interval of credit; the next one
        // picks the stretch back up. Not worth an error on the screen.
      }
    };

    (async () => {
      deviceId = await getDeviceId();
      city = await getRadioCity(cityLookupUrl);
      if (active) await send();
    })().catch((error) => reportError(error, { fn: 'radio.beatStart' }));

    const id = setInterval(() => void send(), RADIO_BEAT_INTERVAL_MS);
    return () => {
      active = false;
      clearInterval(id);
      void send(true);
    };
  }, [state, beat, cityLookupUrl, isLive]);

  useEffect(() => clearAttemptTimer, [clearAttemptTimer]);

  const position = source.kind === 'recording' ? status.currentTime : 0;
  const duration = source.kind === 'recording' ? status.duration : 0;

  const value = useMemo(
    () => ({
      state,
      source,
      ready: !!streamUrl,
      position,
      duration,
      play,
      playRecording,
      pause,
      resume,
      stop,
    }),
    [state, source, streamUrl, position, duration, play, playRecording, pause, resume, stop],
  );

  return <RadioPlayerContext.Provider value={value}>{children}</RadioPlayerContext.Provider>;
}
