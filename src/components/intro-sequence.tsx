"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Volume2, VolumeX } from "lucide-react";

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
  const [checks, setChecks] = useState<boolean[]>(() => RULES.map(() => false));
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

  function toggleCheck(index: number) {
    setChecks((current) => {
      const next = [...current];
      next[index] = !next[index];
      return next;
    });
    sfx.playApprovalPing();
  }

  const allChecked = useMemo(() => checks.every(Boolean), [checks]);

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
          className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--t-muted)] transition-colors hover:text-[var(--t-accent)]"
        >
          [ SKIP INTRO ]
        </button>
        <button
          type="button"
          onClick={toggleMute}
          aria-label={muted ? "Unmute music" : "Mute music"}
          title={muted ? "Unmute music" : "Mute music"}
          className="grid h-9 w-9 place-items-center border border-[var(--t-divider)] text-[var(--t-accent)] transition-colors hover:border-[var(--t-accent)] hover:bg-[var(--t-accent-soft)] hover:text-[var(--t-text)]"
        >
          {muted ? (
            <VolumeX className="h-4 w-4" />
          ) : (
            <Volume2 className="h-4 w-4" />
          )}
        </button>
      </header>

      <main className="flex flex-1 items-center justify-center px-5 py-8 sm:px-8">
        <div className="mx-auto w-full max-w-3xl">
          {screen === 0 && <SceneSet onAdvance={advance} />}
          {screen === 1 && <HowItWorks onAdvance={advance} />}
          {screen === 2 && (
            <RulesAndAgree
              checks={checks}
              onToggle={toggleCheck}
              allChecked={allChecked}
              onAgree={() => finish(true)}
            />
          )}
        </div>
      </main>

      <footer className="flex items-center justify-center gap-2 px-4 pb-6 text-[10px] uppercase tracking-[0.22em] text-[var(--t-muted)] sm:pb-8">
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

function PrimaryButton({
  onClick,
  disabled,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "group inline-flex min-h-12 items-center gap-2 border bg-[var(--t-panel-strong)] px-6 py-3 font-mono text-sm font-black uppercase tracking-[0.18em] transition-colors focus:outline-none",
        disabled
          ? "cursor-not-allowed border-[var(--t-divider)] text-[var(--t-muted)] opacity-60"
          : "border-[var(--t-accent)] text-[var(--t-accent)] hover:bg-[var(--t-accent)] hover:text-[var(--t-bg)] focus:bg-[var(--t-accent)] focus:text-[var(--t-bg)]"
      )}
    >
      {children}
    </button>
  );
}

function SceneSet({ onAdvance }: { onAdvance: () => void }) {
  return (
    <div className="mc-crt-reveal flex flex-col gap-6 sm:gap-8">
      <p className="text-[10px] font-bold uppercase tracking-[0.32em] text-[var(--t-green)]">
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
        <PrimaryButton onClick={onAdvance}>
          {">"} Step onto the floor
          <span className="cursor-blink">█</span>
        </PrimaryButton>
        <p className="mt-3 text-[10px] uppercase tracking-[0.22em] text-[var(--t-muted)]">
          Audio starts on click. Click the speaker icon to mute.
        </p>
      </div>
    </div>
  );
}

function HowItWorks({ onAdvance }: { onAdvance: () => void }) {
  return (
    <div className="flex flex-col gap-6 sm:gap-8">
      <div className="flex flex-col gap-2">
        <p className="text-[10px] font-bold uppercase tracking-[0.32em] text-[var(--t-green)]">
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
        <PrimaryButton onClick={onAdvance}>
          {">"} Show me the rules
          <span className="cursor-blink">█</span>
        </PrimaryButton>
      </div>
    </div>
  );
}

function RulesAndAgree({
  checks,
  onToggle,
  allChecked,
  onAgree,
}: {
  checks: boolean[];
  onToggle: (index: number) => void;
  allChecked: boolean;
  onAgree: () => void;
}) {
  return (
    <div className="flex flex-col gap-6 sm:gap-8">
      <div className="flex flex-col gap-2">
        <p className="text-[10px] font-bold uppercase tracking-[0.32em] text-[var(--t-amber)]">
          The fine print · check every box
        </p>
        <h2 className="font-[family-name:var(--font-plex-sans)] text-4xl font-black uppercase leading-tight tracking-tight text-[var(--t-accent)] sm:text-5xl">
          Sign on the dotted line.
        </h2>
      </div>
      <ul className="space-y-3">
        {RULES.map((rule, i) => {
          const checked = checks[i];
          return (
            <li key={rule.title}>
              <button
                type="button"
                onClick={() => onToggle(i)}
                aria-pressed={checked}
                className={cn(
                  "group flex w-full items-start gap-4 border px-4 py-3 text-left transition-colors focus:outline-none",
                  checked
                    ? "border-[var(--t-green)] bg-[var(--t-green)]/[0.06]"
                    : "border-[var(--t-divider)] bg-[var(--t-panel-strong)] hover:border-[var(--t-accent)]"
                )}
              >
                <span
                  className={cn(
                    "mt-0.5 grid h-6 w-6 shrink-0 place-items-center border font-mono text-xs font-black",
                    checked
                      ? "border-[var(--t-green)] bg-[var(--t-green)] text-[var(--t-bg)]"
                      : "border-[var(--t-divider)] text-[var(--t-muted)] group-hover:border-[var(--t-accent)] group-hover:text-[var(--t-accent)]"
                  )}
                  aria-hidden
                >
                  {checked ? "✓" : ""}
                </span>
                <span className="min-w-0 flex-1">
                  <span
                    className={cn(
                      "block font-[family-name:var(--font-plex-sans)] text-base font-black uppercase tracking-wide",
                      checked
                        ? "text-[var(--t-green)]"
                        : "text-[var(--t-accent)]"
                    )}
                  >
                    {rule.title}
                  </span>
                  <span className="mt-1 block text-sm leading-6 text-[var(--t-text)]/90">
                    {rule.body}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <div className="pt-2">
        <PrimaryButton onClick={onAgree} disabled={!allChecked}>
          {">"} I&apos;m in
          <span className="cursor-blink">█</span>
        </PrimaryButton>
        <p className="mt-3 text-[10px] uppercase tracking-[0.22em] text-[var(--t-muted)]">
          {allChecked
            ? "Email OTP on the next screen. Welcome to the desk."
            : "Acknowledge every rule to continue."}
        </p>
      </div>
    </div>
  );
}
