"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";

import { SFX_VOLUME } from "@/lib/motion-tokens";

const STORAGE_KEY = "mc-sfx-enabled";
const VOLUME_KEY = "mc-sfx-volume";

let sharedContext: AudioContext | null = null;
let masterGain: GainNode | null = null;
let audioUnlocked = false;

// Module-level store so every useSfx() consumer (top bar toggle, toasts,
// moments, sound controls) shares one enabled/volume state.
let enabledState = getStoredEnabled();
let volumeState = getStoredVolume();
const listeners = new Set<() => void>();
const lastPlayedAt = new Map<string, number>();

function getStoredEnabled() {
  if (typeof window === "undefined") return true;
  return localStorage.getItem(STORAGE_KEY) !== "false";
}

function getStoredVolume() {
  if (typeof window === "undefined") return SFX_VOLUME.master;
  const raw = localStorage.getItem(VOLUME_KEY);
  const parsed = raw === null ? NaN : Number(raw);
  return Number.isFinite(parsed)
    ? Math.max(0, Math.min(1, parsed))
    : SFX_VOLUME.master;
}

function subscribeStore(onChange: () => void) {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}

function emitChange() {
  for (const listener of listeners) listener();
}

function getEnabledSnapshot() {
  return enabledState;
}

function getVolumeSnapshot() {
  return volumeState;
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

function getMasterGain(ctx: AudioContext): GainNode {
  if (!masterGain) {
    masterGain = ctx.createGain();
    masterGain.gain.value = volumeState;
    masterGain.connect(ctx.destination);
  }
  return masterGain;
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

/** Returns the audio context when sound may play; rate-limits per sound key. */
function acquireContext(
  soundKey: string,
  minIntervalMs = 0
): AudioContext | null {
  if (!enabledState || !audioUnlocked) return null;
  const ctx = getAudioContext();
  if (!ctx) return null;
  if (minIntervalMs > 0) {
    const now = Date.now();
    const last = lastPlayedAt.get(soundKey) ?? 0;
    if (now - last < minIntervalMs) return null;
    lastPlayedAt.set(soundKey, now);
  }
  return ctx;
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
  gain.connect(getMasterGain(params.ctx));
  osc.start(params.startAt);
  osc.stop(params.startAt + params.duration + 0.02);
}

function storeSetEnabled(next: boolean) {
  enabledState = next;
  localStorage.setItem(STORAGE_KEY, String(next));
  if (next) void unlockAudio();
  emitChange();
}

function storeSetVolume(next: number) {
  volumeState = Math.max(0, Math.min(1, next));
  localStorage.setItem(VOLUME_KEY, String(volumeState));
  if (masterGain) masterGain.gain.value = volumeState;
  emitChange();
}

export function useSfx() {
  const enabled = useSyncExternalStore(
    subscribeStore,
    getEnabledSnapshot,
    () => true
  );
  const volume = useSyncExternalStore(
    subscribeStore,
    getVolumeSnapshot,
    () => SFX_VOLUME.master
  );

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
    storeSetEnabled(!enabledState);
  }, []);

  const setVolume = useCallback((next: number) => {
    storeSetVolume(next);
  }, []);

  const playDealToast = useCallback(() => {
    const ctx = acquireContext("dealToast", 150);
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
    const ctx = acquireContext("wipeout", 300);
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

  /** Very quiet blip for wire/feed arrivals. Heavily rate-limited. */
  const playWireTick = useCallback(() => {
    const ctx = acquireContext("wireTick", 150);
    if (!ctx) return;
    playTone({
      ctx,
      startAt: ctx.currentTime,
      frequency: 1500,
      duration: 0.03,
      volume: SFX_VOLUME.tick,
      type: "triangle",
    });
  }, []);

  /** Short confirmation ping for approve/deny actions. */
  const playApprovalPing = useCallback(() => {
    const ctx = acquireContext("approvalPing", 150);
    if (!ctx) return;
    playTone({
      ctx,
      startAt: ctx.currentTime,
      frequency: 1200,
      duration: 0.08,
      volume: SFX_VOLUME.ping,
      type: "triangle",
    });
  }, []);

  /** Ascending cash-register cluster for a win reveal. */
  const playWin = useCallback(() => {
    const ctx = acquireContext("win", 300);
    if (!ctx) return;
    const now = ctx.currentTime;
    playTone({
      ctx,
      startAt: now,
      frequency: 660,
      duration: 0.09,
      volume: SFX_VOLUME.win,
      type: "triangle",
    });
    playTone({
      ctx,
      startAt: now + 0.1,
      frequency: 880,
      duration: 0.09,
      volume: SFX_VOLUME.win,
      type: "triangle",
    });
    playTone({
      ctx,
      startAt: now + 0.2,
      frequency: 1320,
      duration: 0.16,
      volume: SFX_VOLUME.win,
      type: "triangle",
    });
  }, []);

  /** Low thud for a loss reveal. */
  const playLoss = useCallback(() => {
    const ctx = acquireContext("loss", 300);
    if (!ctx) return;
    playTone({
      ctx,
      startAt: ctx.currentTime,
      frequency: 110,
      endFrequency: 55,
      duration: 0.3,
      volume: SFX_VOLUME.loss,
      type: "sine",
    });
  }, []);

  /** Three-note arpeggio stinger for ceremony reveals / deal closes. */
  const playStinger = useCallback(() => {
    const ctx = acquireContext("stinger", 300);
    if (!ctx) return;
    const now = ctx.currentTime;
    const notes = [440, 554, 659];
    notes.forEach((frequency, index) => {
      playTone({
        ctx,
        startAt: now + index * 0.08,
        frequency,
        duration: 0.1,
        volume: SFX_VOLUME.stinger,
        type: "sawtooth",
      });
    });
  }, []);

  return {
    enabled,
    volume,
    toggleEnabled,
    setVolume,
    playDealToast,
    playWipeoutToast,
    playWireTick,
    playApprovalPing,
    playWin,
    playLoss,
    playStinger,
  };
}
