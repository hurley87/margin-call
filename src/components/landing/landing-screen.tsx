"use client";

import { GameButton } from "@/components/ui/game-button";

/**
 * Minimal connect shell — brand + CTA. Privy email OTP creates an embedded wallet.
 */
export function LandingScreen({ onLogin }: { onLogin: () => void }) {
  return (
    <div className="relative isolate flex min-h-[100svh] flex-col overflow-hidden bg-[#050706] font-mono text-[var(--t-text)]">
      <div
        aria-hidden
        className="absolute inset-0 bg-[radial-gradient(ellipse_120%_80%_at_12%_88%,rgba(214,166,96,0.18),transparent_46%),radial-gradient(ellipse_70%_55%_at_88%_18%,rgba(101,160,94,0.12),transparent_50%),linear-gradient(180deg,#040605_0%,#070b09_52%,#050706_100%)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 crt-line-grid opacity-[0.14]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_35%,rgba(0,0,0,0.72)_100%)]"
      />

      <div className="relative z-10 flex flex-1 flex-col justify-center px-5 pb-16 pt-10 sm:px-8 sm:pb-20 md:max-w-[40rem]">
        <p className="text-[11px] font-bold uppercase tracking-[0.28em] text-[var(--t-green)]">
          Robinhood Chain // testnet
        </p>
        <h1 className="mt-3 font-[family-name:var(--font-plex-sans)] text-[clamp(3.25rem,12vw,6.5rem)] font-black uppercase leading-[0.88] tracking-tight text-[var(--t-accent)]">
          Margin Call
        </h1>
        <p className="mt-4 max-w-[28rem] text-base leading-7 text-[var(--t-text)]/92 sm:text-lg">
          NAV-weighted Pack rips. Connect a wallet to play.
        </p>
        <div className="mt-8">
          <GameButton onClick={onLogin} size="lg">
            {">"} Enter by email
            <span className="cursor-blink">█</span>
          </GameButton>
        </div>
      </div>
    </div>
  );
}
