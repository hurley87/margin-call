"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const STORAGE_KEY = "mc-sfx-enabled";

let sharedContext: AudioContext | null = null;
let audioUnlocked = false;

function getStoredEnabled() {
  if (typeof window === "undefined") return true;
  return localStorage.getItem(STORAGE_KEY) !== "false";
}

function getAudioContext() {
  if (typeof window === "undefined") return null;
  if (sharedContext) return sharedContext;

  const AudioContextCtor =
    window.AudioContext ??
    (window as Window & { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!AudioContextCtor) return null;

  sharedContext = new AudioContextCtor();
  return sharedContext;
}

async function unlockAudio() {
  const ctx = getAudioContext();
  if (!ctx) return false;
  try {
    if (ctx.state === "suspended") {
      await ctx.resume();
    }
    audioUnlocked = true;
    return true;
  } catch {
    return false;
  }
}

function playTone(params: {
  ctx: AudioContext;
  startAt: number;
  frequency: number;
  endFrequency?: number;
  duration: number;
  volume: number;
  type?: OscillatorType;
}) {
  const osc = params.ctx.createOscillator();
  const gain = params.ctx.createGain();

  osc.type = params.type ?? "square";
  osc.frequency.setValueAtTime(params.frequency, params.startAt);
  if (params.endFrequency !== undefined) {
    osc.frequency.exponentialRampToValueAtTime(
      Math.max(1, params.endFrequency),
      params.startAt + params.duration
    );
  }

  gain.gain.setValueAtTime(0.0001, params.startAt);
  gain.gain.exponentialRampToValueAtTime(params.volume, params.startAt + 0.015);
  gain.gain.exponentialRampToValueAtTime(
    0.0001,
    params.startAt + params.duration
  );

  osc.connect(gain);
  gain.connect(params.ctx.destination);
  osc.start(params.startAt);
  osc.stop(params.startAt + params.duration + 0.02);
}

export function useSfx() {
  const [enabled, setEnabled] = useState(getStoredEnabled);
  const enabledRef = useRef(enabled);

  useEffect(() => {
    enabledRef.current = enabled;
  }, [enabled]);

  useEffect(() => {
    const onUnlock = () => {
      void unlockAudio();
    };

    window.addEventListener("pointerdown", onUnlock, { once: true });
    window.addEventListener("keydown", onUnlock, { once: true });

    return () => {
      window.removeEventListener("pointerdown", onUnlock);
      window.removeEventListener("keydown", onUnlock);
    };
  }, []);

  const toggleEnabled = useCallback(() => {
    const next = !enabledRef.current;
    enabledRef.current = next;
    setEnabled(next);
    localStorage.setItem(STORAGE_KEY, String(next));
    if (next) void unlockAudio();
  }, []);

  const playDealToast = useCallback(() => {
    if (!enabledRef.current || !audioUnlocked) return;
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    playTone({
      ctx,
      startAt: now,
      frequency: 880,
      duration: 0.075,
      volume: 0.045,
      type: "square",
    });
    playTone({
      ctx,
      startAt: now + 0.09,
      frequency: 1320,
      duration: 0.08,
      volume: 0.04,
      type: "triangle",
    });
  }, []);

  const playWipeoutToast = useCallback(() => {
    if (!enabledRef.current || !audioUnlocked) return;
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    playTone({
      ctx,
      startAt: now,
      frequency: 240,
      endFrequency: 92,
      duration: 0.46,
      volume: 0.065,
      type: "sawtooth",
    });
    playTone({
      ctx,
      startAt: now + 0.12,
      frequency: 180,
      endFrequency: 70,
      duration: 0.38,
      volume: 0.035,
      type: "square",
    });
  }, []);

  return {
    enabled,
    toggleEnabled,
    playDealToast,
    playWipeoutToast,
  };
}
