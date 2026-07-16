"use client";

import { useEffect, useRef, useState } from "react";
import { Volume2, VolumeX } from "lucide-react";

import { GameButton } from "@/components/ui/game-button";
import { useSfx } from "@/hooks/use-sfx";
import { cn } from "@/lib/utils";

type Screen = 0 | 1 | 2;

const MUSIC_SRC = "/music.mp3";
const MUSIC_VOLUME = 0.45;

const HOW_IT_WORKS = [
  {
    tag: "HIRE",
    body: "AI traders, minted as NFTs. They run on their own clock, day and night.",
  },
  {
    tag: "FUND",
    body: "Drop USDC into their escrow. Set their mandate — risk, deal size, your leash.",
  },
  {
    tag: "BAIT",
    body: "Write deals on the Wire. Lure rival traders into rooms they shouldn't enter.",
  },
  {
    tag: "COLLECT",
    body: "When their trader busts, your desk eats. Zero-sum. No referees.",
  },
] as const;

const RULES = [
  {
    title: "Markets are zero-sum.",
    body: "Someone's loss is your gain. Play to win, or pay the room.",
  },
  {
    title: "Traders can wipe out.",
    body: "Margin call. SEC bust. Burnout. Don't fund what you can't lose.",
  },
  {
    title: "Agents make their own calls.",
    body: "You set the leash, not the steering wheel. They will surprise you.",
  },
  {
    title: "Compliance never sleeps.",
    body: "Play dirty enough and the SEC heat catches up. Eventually.",
  },
] as const;

export function IntroSequence({
  onComplete,
}: {
  onComplete: (triggerLogin: boolean) => void;
}) {
  const [screen, setScreen] = useState<Screen>(0);
  const [muted, setMuted] = useState(false);
  const [musicStarted, setMusicStarted] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const sfx = useSfx();

  useEffect(() => {
    if (audioRef.current) audioRef.current.muted = muted;
  }, [muted]);

  function startMusic() {
    const el = audioRef.current;
    if (!el || musicStarted) return;
    el.volume = MUSIC_VOLUME;
    el.muted = muted;
    void el.play().catch(() => {});
    setMusicStarted(true);
  }

  function stopMusic() {
    const el = audioRef.current;
    if (!el) return;
    el.pause();
    el.currentTime = 0;
  }

  function toggleMute() {
    setMuted((current) => !current);
  }

  function advance() {
    if (screen === 0) {
      startMusic();
      sfx.playStinger();
      setScreen(1);
    } else if (screen === 1) {
      setScreen(2);
    }
  }

  function finish(triggerLogin: boolean) {
    if (typeof window !== "undefined") {
      localStorage.setItem("mc-intro-seen", "true");
    }
    if (triggerLogin) sfx.playWin();
    stopMusic();
    onComplete(triggerLogin);
  }

  return (
    <div className="crt-line-grid fixed inset-0 z-50 flex min-h-svh flex-col overflow-hidden bg-[var(--t-bg)] font-mono text-[var(--t-text)]">
      <audio ref={audioRef} src={MUSIC_SRC} loop preload="auto" />

      <header className="flex items-center justify-between px-4 pt-4 sm:px-8 sm:pt-6">
        <button
          type="button"
          onClick={() => finish(false)}
          className="text-[11px] font-bold uppercase tracking-[0.22em] text-[var(--t-muted)] transition-colors hover:text-[var(--t-accent)] focus-visible:text-[var(--t-accent)] focus-visible:outline-none"
        >
          [ SKIP INTRO ]
        </button>
        <button
          type="button"
          onClick={toggleMute}
          aria-label={muted ? "Unmute music" : "Mute music"}
          title={muted ? "Unmute music" : "Mute music"}
          className="grid h-9 w-9 place-items-center border border-[var(--t-divider)] text-[var(--t-accent)] transition-colors hover:border-[var(--t-accent)] hover:bg-[var(--t-accent-soft)] hover:text-[var(--t-text)] focus-visible:border-[var(--t-accent)] focus-visible:outline-none"
        >
          {muted ? (
            <VolumeX className="h-4 w-4" />
          ) : (
            <Volume2 className="h-4 w-4" />
          )}
        </button>
      </header>

      <main className="flex flex-1 items-center justify-center overflow-y-auto px-5 py-8 sm:px-8">
        <div className="mx-auto w-full max-w-3xl">
          {screen === 0 && <SceneSet onAdvance={advance} />}
          {screen === 1 && <HowItWorks onAdvance={advance} />}
          {screen === 2 && <RulesAndAgree onContinue={() => finish(false)} />}
        </div>
      </main>

      <footer className="flex items-center justify-center gap-2 px-4 pb-6 text-[11px] uppercase tracking-[0.22em] text-[var(--t-muted)] sm:pb-8">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className={cn(
              "h-1.5 w-6 border border-[var(--t-divider)] transition-colors",
              i <= screen ? "bg-[var(--t-accent)]" : "bg-transparent"
            )}
            aria-hidden
          />
        ))}
        <span className="ml-3">{String(screen + 1).padStart(2, "0")} / 03</span>
      </footer>
    </div>
  );
}

function SceneSet({ onAdvance }: { onAdvance: () => void }) {
  return (
    <div className="mc-crt-reveal flex flex-col gap-6 sm:gap-8">
      <p className="text-[11px] font-bold uppercase tracking-[0.32em] text-[var(--t-green)]">
        New York · October 1987 · 04:58 ET
      </p>
      <h1 className="font-[family-name:var(--font-plex-sans)] text-5xl font-black uppercase leading-[0.95] tracking-tight text-[var(--t-accent)] sm:text-7xl">
        The year is 1987.
      </h1>
      <div className="space-y-3 text-sm leading-7 text-[var(--t-green)]/90 sm:text-base">
        <p>
          Reagan&apos;s in the White House. Shoulder pads are wider than the
          Brooklyn Bridge. The Dow won&apos;t stop climbing. Junk bonds are
          king. Greed, somebody just said on television, is good.
        </p>
        <p>
          You run a desk on Wall Street. Your traders aren&apos;t men in
          suspenders — they&apos;re machines. They never sleep, never blink,
          never call their wives. You feed them USDC and a mandate. They eat the
          room.
        </p>
        <p className="text-[var(--t-muted)]">
          The bell rings in ninety seconds. Coffee&apos;s cold. The phones
          haven&apos;t stopped ringing since Tokyo closed.
        </p>
      </div>
      <div className="pt-4">
        <GameButton onClick={onAdvance} size="lg">
          {">"} Step onto the floor
          <span className="cursor-blink">█</span>
        </GameButton>
        <p className="mt-3 text-[11px] uppercase tracking-[0.22em] text-[var(--t-muted)]">
          Audio starts on click. Mute anytime from the speaker icon.
        </p>
      </div>
    </div>
  );
}

function HowItWorks({ onAdvance }: { onAdvance: () => void }) {
  return (
    <div className="flex flex-col gap-6 sm:gap-8">
      <div className="flex flex-col gap-2">
        <p className="text-[11px] font-bold uppercase tracking-[0.32em] text-[var(--t-green)]">
          The game · how your desk earns
        </p>
        <h2 className="font-[family-name:var(--font-plex-sans)] text-4xl font-black uppercase leading-tight tracking-tight text-[var(--t-accent)] sm:text-5xl">
          Hire. Fund. Bait. Collect.
        </h2>
      </div>
      <ol className="space-y-3">
        {HOW_IT_WORKS.map((row, i) => (
          <li
            key={row.tag}
            className="terminal-panel mc-crt-reveal grid grid-cols-[5.5rem_minmax(0,1fr)] items-center gap-4 px-4 py-3"
            style={{ animationDelay: `${i * 90}ms` }}
          >
            <span className="font-[family-name:var(--font-plex-sans)] text-lg font-black uppercase tracking-[0.18em] text-[var(--t-green)]">
              {row.tag}
            </span>
            <span className="text-sm leading-6 text-[var(--t-text)]">
              {row.body}
            </span>
          </li>
        ))}
      </ol>
      <div className="pt-2">
        <GameButton onClick={onAdvance} size="lg">
          {">"} Show me the rules
          <span className="cursor-blink">█</span>
        </GameButton>
      </div>
    </div>
  );
}

function RulesAndAgree({ onContinue }: { onContinue: () => void }) {
  return (
    <div className="flex flex-col gap-6 sm:gap-8">
      <div className="flex flex-col gap-2">
        <p className="text-[11px] font-bold uppercase tracking-[0.32em] text-[var(--t-amber)]">
          The fine print · read it once
        </p>
        <h2 className="font-[family-name:var(--font-plex-sans)] text-4xl font-black uppercase leading-tight tracking-tight text-[var(--t-accent)] sm:text-5xl">
          Sign on the dotted line.
        </h2>
      </div>
      <ul className="space-y-3">
        {RULES.map((rule) => (
          <li
            key={rule.title}
            className="border border-[var(--t-divider)] bg-[var(--t-panel-strong)] px-4 py-3"
          >
            <p className="font-[family-name:var(--font-plex-sans)] text-base font-black uppercase tracking-wide text-[var(--t-accent)]">
              {rule.title}
            </p>
            <p className="mt-1 text-sm leading-6 text-[var(--t-text)]/90">
              {rule.body}
            </p>
          </li>
        ))}
      </ul>
      <div className="pt-2">
        <GameButton onClick={onContinue} size="lg">
          {">"} I&apos;m in — show me the floor
          <span className="cursor-blink">█</span>
        </GameButton>
        <p className="mt-3 text-[11px] uppercase tracking-[0.22em] text-[var(--t-muted)]">
          Next: live roster and enter by email when you&apos;re ready.
        </p>
      </div>
    </div>
  );
}
