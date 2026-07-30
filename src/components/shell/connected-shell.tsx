"use client";

import { StarterGrantPanel } from "@/components/grants/starter-grant-panel";
import { MyPacksDashboard } from "@/components/maker/my-packs-dashboard";
import { BrowsePool } from "@/components/pool/browse-pool";
import { GameButton } from "@/components/ui/game-button";
import { formatShortAddress } from "@/lib/utils";

type Props = {
  address: string | null;
  onLogout: () => void;
};

/**
 * Post-auth shell: wallet + Starter Grant + Maker dashboard + Browse Pool.
 */
export function ConnectedShell({ address, onLogout }: Props) {
  const convexConfigured = Boolean(process.env.NEXT_PUBLIC_CONVEX_URL);

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

      <div className="relative z-10 mx-auto flex w-full max-w-3xl flex-1 flex-col px-5 pb-16 pt-10 sm:px-8 sm:pb-20">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.28em] text-[var(--t-green)]">
              Connected
            </p>
            <h1 className="mt-3 font-[family-name:var(--font-plex-sans)] text-[clamp(2.5rem,10vw,4.5rem)] font-black uppercase leading-[0.88] tracking-tight text-[var(--t-accent)]">
              Margin Call
            </h1>
            <p className="mt-4 text-base leading-7 text-[var(--t-text)]/92">
              {address
                ? `Wallet ${formatShortAddress(address)}`
                : "Wallet provisioning…"}
            </p>
          </div>
          <GameButton onClick={onLogout} variant="secondary" size="sm">
            [LOG OUT]
          </GameButton>
        </header>

        {address && convexConfigured ? (
          <StarterGrantPanel walletAddress={address} />
        ) : null}

        {convexConfigured ? (
          <>
            <MyPacksDashboard walletAddress={address} />
            <BrowsePool />
          </>
        ) : (
          <p className="mt-10 text-sm text-[var(--t-muted)]">
            Convex is not configured — pool browse unavailable.
          </p>
        )}
      </div>
    </div>
  );
}
