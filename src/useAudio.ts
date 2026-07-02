// useAudio.ts — React hook for managing timer sounds, previews, and break music

import { useRef, useCallback } from "react";
import type { TimerSound } from "./settings";

const SOUND_PATHS: Record<TimerSound, string | null> = {
  bell: "/sounds/bell.mp3",
  piano: "/sounds/piano.mp3",
  bird: "/sounds/bird.mp3",
  chime: "/sounds/chime.mp3",
  none: null,
};

const BREAK_MUSIC_PATH = "/sounds/break-music.mp3";

/**
 * Creates a fresh Audio element and applies the given volume.
 */
function makeAudio(src: string, volume: number): HTMLAudioElement {
  const audio = new Audio(src);
  audio.volume = volume;
  return audio;
}

export function useAudio() {
  // Currently previewing sound (for the Settings modal)
  const previewRef = useRef<HTMLAudioElement | null>(null);
  // Timeout ID for the 10-second preview auto-stop
  const previewTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Currently looping break music
  const breakMusicRef = useRef<HTMLAudioElement | null>(null);
  // Persist timer-end audio elements so GC doesn't collect them mid-playback
  const timerEndRefs = useRef<HTMLAudioElement[]>([]);

  /** Play a single preview of the given sound, limited to 10 seconds. */
  const playPreview = useCallback((sound: TimerSound, volume: number) => {
    // Clear any existing 10-second auto-stop timer
    if (previewTimeoutRef.current !== null) {
      clearTimeout(previewTimeoutRef.current);
      previewTimeoutRef.current = null;
    }
    // Stop any currently playing preview
    if (previewRef.current) {
      previewRef.current.pause();
      previewRef.current = null;
    }

    const path = SOUND_PATHS[sound];
    if (!path) return; // "none" selected

    const audio = makeAudio(path, volume);
    audio.addEventListener("ended", () => {
      if (previewRef.current === audio) previewRef.current = null;
    });
    previewRef.current = audio;
    audio.play().catch(() => {});

    // Auto-stop preview after 10 seconds
    previewTimeoutRef.current = setTimeout(() => {
      if (previewRef.current === audio) {
        audio.pause();
        audio.currentTime = 0;
        previewRef.current = null;
      }
      previewTimeoutRef.current = null;
    }, 10_000);
  }, []);

  /** Play the timer-end sound once (respects settings). */
  const playTimerEnd = useCallback(
    (sound: TimerSound, enabled: boolean, volume: number) => {
      if (!enabled) return;
      const path = SOUND_PATHS[sound];
      if (!path) return;
      const audio = makeAudio(path, volume);
      // Track in ref so GC doesn't collect it during playback
      timerEndRefs.current.push(audio);
      audio.addEventListener("ended", () => {
        const idx = timerEndRefs.current.indexOf(audio);
        if (idx !== -1) timerEndRefs.current.splice(idx, 1);
      });
      audio.play().catch(() => {
        const idx = timerEndRefs.current.indexOf(audio);
        if (idx !== -1) timerEndRefs.current.splice(idx, 1);
      });
    },
    []
  );

  /** Start looping break music. */
  const startBreakMusic = useCallback((volume: number) => {
    stopBreakMusic();
    const audio = makeAudio(BREAK_MUSIC_PATH, volume);
    audio.loop = true;
    audio.play().catch(() => {});
    breakMusicRef.current = audio;
  }, []);

  /** Stop looping break music and reset position. */
  const stopBreakMusic = useCallback(() => {
    if (breakMusicRef.current) {
      breakMusicRef.current.pause();
      breakMusicRef.current.currentTime = 0;
      breakMusicRef.current = null;
    }
  }, []);

  /** Update volume on any currently playing audio. */
  const updateVolume = useCallback((vol: number) => {
    if (previewRef.current) previewRef.current.volume = vol;
    if (breakMusicRef.current) breakMusicRef.current.volume = vol;
  }, []);

  return {
    playPreview,
    playTimerEnd,
    startBreakMusic,
    stopBreakMusic,
    updateVolume,
  };
}