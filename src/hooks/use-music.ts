"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const STORAGE_KEY_VOLUME = "mc-music-volume";
const STORAGE_KEY_PLAYING = "mc-music-playing";

function getStored<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const v = localStorage.getItem(key);
    return v !== null ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}

// Module-level singleton so multiple hook consumers share one audio element
let sharedAudio: HTMLAudioElement | null = null;
let refCount = 0;

function getAudio(initialVolume: number): HTMLAudioElement {
  if (!sharedAudio) {
    sharedAudio = new Audio("/music.mp3");
    sharedAudio.loop = true;
    sharedAudio.volume = initialVolume;
  }
  return sharedAudio;
}

export function useMusic() {
  const [playing, setPlaying] = useState(false);
  const [volume, setVolumeState] = useState(() =>
    getStored(STORAGE_KEY_VOLUME, 0.5)
  );
  const volumeWriteTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    const audio = getAudio(volume);
    refCount++;

    // Sync React state with actual audio events
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);

    // Sync initial state if audio is already playing (from another mount)
    setPlaying(!audio.paused);

    // Auto-play if previously playing and audio isn't already active
    if (audio.paused && getStored(STORAGE_KEY_PLAYING, false)) {
      audio.play().catch(() => {});
    }

    return () => {
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      refCount--;
      if (refCount === 0) {
        audio.pause();
        audio.removeAttribute("src");
        audio.load();
        sharedAudio = null;
      }
    };
    // volume is only needed for initial creation — intentionally omitted from deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const togglePlay = useCallback(() => {
    if (!sharedAudio) return;

    if (sharedAudio.paused) {
      sharedAudio
        .play()
        .then(() => {
          localStorage.setItem(STORAGE_KEY_PLAYING, "true");
        })
        .catch(() => {});
    } else {
      sharedAudio.pause();
      localStorage.setItem(STORAGE_KEY_PLAYING, "false");
    }
  }, []);

  const setVolume = useCallback((v: number) => {
    const clamped = Math.max(0, Math.min(1, v));
    if (sharedAudio) sharedAudio.volume = clamped;
    setVolumeState(clamped);

    // Debounce localStorage write during slider drag
    clearTimeout(volumeWriteTimer.current);
    volumeWriteTimer.current = setTimeout(() => {
      localStorage.setItem(STORAGE_KEY_VOLUME, JSON.stringify(clamped));
    }, 300);
  }, []);

  return { playing, volume, togglePlay, setVolume };
}
