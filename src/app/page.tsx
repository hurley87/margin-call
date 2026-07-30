"use client";

import { usePrivy } from "@privy-io/react-auth";

import { LandingScreen } from "@/components/landing/landing-screen";
import { ConnectedShell } from "@/components/shell/connected-shell";
import { getEmbeddedEvmWalletAddress } from "@/lib/privy/wallet";

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
