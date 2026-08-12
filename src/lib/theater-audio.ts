/**
 * Optional theater audio via the Web Audio API.
 * Muted by default; AudioContext is created only after an explicit user gesture
 * (the sound toggle), which satisfies autoplay policy.
 */

const SOUND_STORAGE_KEY = "margin-call-theater-sound";

export function readTheaterSoundEnabled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(SOUND_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function writeTheaterSoundEnabled(enabled: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SOUND_STORAGE_KEY, enabled ? "1" : "0");
  } catch {
    // Ignore quota / private-mode failures; in-memory toggle still works.
  }
}

const soundListeners = new Set<() => void>();

/**
 * Subscribe to sound-preference changes. Every `setEnabled` call notifies,
 * so UI stays in sync no matter which surface flips the preference.
 */
export function subscribeTheaterSound(listener: () => void): () => void {
  soundListeners.add(listener);
  return () => {
    soundListeners.delete(listener);
  };
}

type TheaterAudioEngine = {
  enabled: boolean;
  setEnabled: (enabled: boolean) => void;
  playTierClose: () => void;
  playCrashBell: () => void;
  playPhoneRing: () => void;
  dispose: () => void;
};

let sharedEngine: TheaterAudioEngine | null = null;

/**
 * Lazily creates (or returns) the shared theater audio engine.
 * Call only from a user-gesture handler the first time sound is enabled.
 */
export function getTheaterAudio(): TheaterAudioEngine {
  if (sharedEngine) return sharedEngine;

  let context: AudioContext | null = null;
  let enabled = readTheaterSoundEnabled();

  const ensureContext = (): AudioContext | null => {
    if (typeof window === "undefined") return null;
    if (!enabled) return null;
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioCtx) return null;
    if (!context) context = new AudioCtx();
    if (context.state === "suspended") {
      void context.resume();
    }
    return context;
  };

  const tone = (
    frequency: number,
    durationMs: number,
    options: { type?: OscillatorType; gain?: number; slideTo?: number } = {}
  ) => {
    const ctx = ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = options.type ?? "sine";
    oscillator.frequency.setValueAtTime(frequency, now);
    if (options.slideTo !== undefined) {
      oscillator.frequency.exponentialRampToValueAtTime(
        Math.max(1, options.slideTo),
        now + durationMs / 1_000
      );
    }
    const peak = options.gain ?? 0.08;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(peak, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + durationMs / 1_000);
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.start(now);
    oscillator.stop(now + durationMs / 1_000 + 0.02);
  };

  sharedEngine = {
    get enabled() {
      return enabled;
    },
    setEnabled(next: boolean) {
      enabled = next;
      writeTheaterSoundEnabled(next);
      if (next) ensureContext();
      for (const listener of soundListeners) listener();
    },
    playTierClose() {
      tone(880, 80, { type: "triangle", gain: 0.04 });
    },
    playCrashBell() {
      tone(660, 420, { type: "sine", gain: 0.1, slideTo: 220 });
      tone(990, 280, { type: "sine", gain: 0.05 });
    },
    playPhoneRing() {
      tone(440, 180, { type: "square", gain: 0.05 });
      window.setTimeout(() => {
        tone(440, 180, { type: "square", gain: 0.05 });
      }, 220);
    },
    dispose() {
      void context?.close();
      context = null;
      sharedEngine = null;
    },
  };

  return sharedEngine;
}
