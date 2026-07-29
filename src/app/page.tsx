"use client";

import { usePrivy } from "@privy-io/react-auth";

import { LandingScreen } from "@/components/landing/landing-screen";
import { GameButton } from "@/components/ui/game-button";
import { getEmbeddedEvmWalletAddress } from "@/lib/privy/wallet";

function shortAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function ConnectedShell({
  address,
  onLogout,
}: {
  address: string | null;
  onLogout: () => void;
}) {
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

      <div className="relative z-10 flex flex-1 flex-col justify-center px-5 pb-16 pt-10 sm:px-8 sm:pb-20 md:max-w-[40rem]">
        <p className="text-[11px] font-bold uppercase tracking-[0.28em] text-[var(--t-green)]">
          Connected
        </p>
        <h1 className="mt-3 font-[family-name:var(--font-plex-sans)] text-[clamp(2.5rem,10vw,5rem)] font-black uppercase leading-[0.88] tracking-tight text-[var(--t-accent)]">
          Margin Call
        </h1>
        <p className="mt-4 max-w-[28rem] text-base leading-7 text-[var(--t-text)]/92">
          {address ? `Wallet ${shortAddress(address)}` : "Wallet provisioning…"}
        </p>
        <div className="mt-8">
          <GameButton onClick={onLogout} variant="secondary" size="lg">
            [LOG OUT]
          </GameButton>
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  const { ready, authenticated, login, logout, user } = usePrivy();

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--t-bg)] font-mono">
        <p className="text-[var(--t-muted)]">
          INITIALIZING...<span className="cursor-blink">█</span>
        </p>
      </div>
    );
  }

  if (!authenticated) {
    return <LandingScreen onLogin={login} />;
  }

  const address = getEmbeddedEvmWalletAddress(user);

  return <ConnectedShell address={address} onLogout={logout} />;
}
