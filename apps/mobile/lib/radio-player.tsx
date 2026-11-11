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
import { radioArtwork, radioArtworkUrl } from '@/lib/radio-artwork';
import { Sentry } from '@/lib/sentry';
import { getDeviceId } from '@/lib/device-id';
import { getRadioCity } from '@/lib/radio-city';

function reportError(error: unknown, tags: { fn: string }) {
  Sentry.captureException(error, { tags });
}

/**
 * The one Reign Radio player (spec 0019, AC-1, AC-2, AC-4).
 *
 * Lives above the tabs, not inside the Radio screen, so leaving the Radio tab
 * never stops the audio, and so Home's Live now card can drive the same
 * player later. There is exactly one: two players on one live stream would
 * fight over the lock screen and the audio session.
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
      artworkUrl?: string;
    };

interface RadioPlayerContextValue {
  state: RadioPlayerState;
  source: RadioPlayerSource;
  /** False until the stream url has arrived from Convex. */
  ready: boolean;
  /** Seconds into a recording, and its length; zero for the live stream. */
  position: number;
  duration: number;
  play: () => void;
  playRecording: (recording: Omit<Extract<RadioPlayerSource, { kind: 'recording' }>, 'kind'>) => void;
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
  stop: () => {},
});

export function useRadioPlayer(): RadioPlayerContextValue {
  return useContext(RadioPlayerContext);
}

const LOCK_SCREEN_OPTIONS = { showSeekForward: false, showSeekBackward: false };
const RECORDING_LOCK_SCREEN_OPTIONS = { showSeekForward: true, showSeekBackward: true };

/** A recording that has not started within this long reads as unavailable. */
const RECORDING_LOAD_TIMEOUT_MS = 15_000;

export function RadioPlayerProvider({ children }: { children: ReactNode }) {
  const config = useQuery(api.radio.getPlaybackConfig, {});
  const streamUrl = config?.streamUrl ?? null;

  // Created with no source: the stream is attached on each play, so a resume
  // after a pause rejoins the live edge instead of replaying a stale buffer.
  const player = useAudioPlayer(null);
  const status = useAudioPlayerStatus(player);

  const [state, setState] = useState<RadioPlayerState>('idle');
  const [source, setSource] = useState<RadioPlayerSource>(LIVE);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lockScreenActive = useRef(false);

  // Minute granularity is plenty for what the lock screen shows.
  const { current } = useRadioNow(60_000);

  const metadata = useMemo<AudioMetadata>(() => {
    if (source.kind === 'recording') {
      return {
        title: source.title,
        artist: source.subtitle ?? 'Kingdom Life Tabernacle',
        albumTitle: 'Reign Radio · Recording',
        ...(source.artworkUrl ? { artworkUrl: source.artworkUrl } : {}),
      };
    }
    const artwork = radioArtworkUrl(radioArtwork(current));
    return {
      title: current?.title ?? 'Reign Radio',
      artist: current?.host ?? 'Kingdom Life Tabernacle',
      albumTitle: 'Reign Radio · Live',
      ...(artwork ? { artworkUrl: artwork } : {}),
    };
  }, [current, source]);

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
    timeoutRef.current = setTimeout(() => {
      timeoutRef.current = null;
      try {
        player.pause();
      } catch {
        // Nothing to pause.
      }
      setState((prev) => (prev === 'connecting' ? 'nothing_on_air' : prev));
    }, RADIO_PLAY_ATTEMPT_TIMEOUT_MS);
  }, [clearAttemptTimer, player, streamUrl, releaseLockScreen]);

  // A recording (AC-27): the same player, pointed at the signed url.
  const playRecording = useCallback<RadioPlayerContextValue['playRecording']>(
    (recording) => {
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
      timeoutRef.current = setTimeout(() => {
        timeoutRef.current = null;
        try {
          player.pause();
        } catch {
          // Nothing to pause.
        }
        setState((prev) => (prev === 'connecting' ? 'unavailable' : prev));
      }, RECORDING_LOAD_TIMEOUT_MS);
    },
    [clearAttemptTimer, player, releaseLockScreen],
  );

  // Audio arriving is what turns an attempt into playback, and what makes
  // this the lock screen player (AC-2).
  useEffect(() => {
    if (state === 'connecting' && status.playing && !status.isBuffering) {
      clearAttemptTimer();
      setState('playing');
    }
    if (state === 'playing' && !status.playing && !status.isBuffering) {
      // Paused from the lock screen or the notification, or the stream ended.
      releaseLockScreen();
      setState('idle');
    }
  }, [state, status.playing, status.isBuffering, clearAttemptTimer, releaseLockScreen]);

  useEffect(() => {
    if (state !== 'playing') return;
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

  // Listening time (spec 0019, AC-12): while audio is actually playing, and
  // only then, beat every thirty seconds naming this device. Leaving the
  // playing state (stopped here, paused from the lock screen, the stream
  // ending) sends one last beat marked as stopping, which closes the stretch.
  // The server credits the time from its own clock; this sends no figure.
  const beat = useMutation(api.radio.beat);
  const cityLookupUrl = config?.cityLookupUrl;
  // A recording is not a broadcast being listened to live, so it never beats.
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
      stop,
    }),
    [state, source, streamUrl, position, duration, play, playRecording, stop],
  );

  return <RadioPlayerContext.Provider value={value}>{children}</RadioPlayerContext.Provider>;
}
