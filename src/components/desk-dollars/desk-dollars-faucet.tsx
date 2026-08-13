"use client";

import { createContext, useContext, type ReactNode } from "react";
import { usePrivy } from "@privy-io/react-auth";
import type { Address } from "viem";
import { DISPLAY_ASSET_SYMBOL } from "@/lib/desk-dollars";
import { getEvmWalletAddress } from "@/lib/privy/wallet";
import {
  getDeskDollarsFaucetChrome,
  useDeskDollarsFaucet,
  type DeskDollarsFaucetSession,
} from "@/hooks/use-desk-dollars-faucet";

function formatCooldown(seconds: bigint) {
  const minutes = Number((seconds + 59n) / 60n);
  return `${minutes} minute${minutes === 1 ? "" : "s"}`;
}

type DeskDollarsFaucetContextValue = {
  walletAddress: Address | null;
  faucet: DeskDollarsFaucetSession;
};

const DeskDollarsFaucetContext =
  createContext<DeskDollarsFaucetContextValue | null>(null);

/**
 * Owns the single faucet session for signed-in chrome. Entry rail and wallet
 * dialog consume this so they cannot submit overlapping sponsored claims.
 */
export function DeskDollarsFaucetProvider({
  children,
}: {
  children: ReactNode;
}) {
  const { user } = usePrivy();
  const walletAddress = getEvmWalletAddress(user);
  const faucet = useDeskDollarsFaucet(walletAddress);

  return (
    <DeskDollarsFaucetContext.Provider value={{ walletAddress, faucet }}>
      {children}
    </DeskDollarsFaucetContext.Provider>
  );
}

function useSharedDeskDollarsFaucet() {
  const value = useContext(DeskDollarsFaucetContext);
  if (!value) {
    throw new Error(
      "DeskDollarsFaucet must be used within DeskDollarsFaucetProvider"
    );
  }
  return value;
}

/**
 * Claim chrome for empty or in-flight faucet states. Funded idle wallets
 * render nothing — balance lives on the wallet chip, not a duplicate card.
 */
export function DeskDollarsFaucet() {
  const { walletAddress, faucet } = useSharedDeskDollarsFaucet();
  const chrome = getDeskDollarsFaucetChrome({
    balance: faucet.balance,
    status: faucet.status,
    canRetry: faucet.canRetry,
  });

  if (!walletAddress) return null;

  const hasStatus =
    faucet.status === "unavailable" ||
    faucet.status === "pending" ||
    faucet.status === "confirmed" ||
    faucet.status === "error";
  if (!hasStatus && !chrome.showOffer && !chrome.showClaimButton) {
    return null;
  }

  return (
    <div className="mt-4 text-left" data-testid="desk-dollars-faucet">
      {faucet.status === "unavailable" ? (
        <p role="alert" className="text-sm text-[var(--t-red)]">
          {faucet.error}
        </p>
      ) : null}
      {faucet.status === "pending" ? (
        <p aria-live="polite" className="text-sm text-[var(--t-muted)]">
          Claim pending until its Base Sepolia receipt succeeds…
        </p>
      ) : null}
      {faucet.status === "confirmed" ? (
        <p aria-live="polite" className="text-sm text-[var(--t-muted)]">
          Desk Dollars claim confirmed on Base Sepolia.
        </p>
      ) : null}
      {faucet.status === "error" ? (
        <p role="alert" className="text-sm text-[var(--t-red)]">
          {faucet.error}
        </p>
      ) : null}
      {chrome.showOffer && !faucet.eligible ? (
        <p className="text-sm text-[var(--t-muted)]">
          Next 100 {DISPLAY_ASSET_SYMBOL} faucet claim in{" "}
          {formatCooldown(faucet.cooldownSeconds)}.
        </p>
      ) : null}
      {chrome.showOffer && faucet.eligible ? (
        <p className="text-sm text-[var(--t-text)]">
          Eligible to claim 100 {DISPLAY_ASSET_SYMBOL} from the faucet.
        </p>
      ) : null}
      {chrome.showClaimButton ? (
        <button
          className="mt-3 w-full min-h-11 border border-[var(--t-accent)] bg-[var(--t-accent)] px-4 py-2 text-xs font-black uppercase tracking-[0.16em] text-[var(--t-bg)] disabled:cursor-not-allowed disabled:opacity-50"
          disabled={!faucet.canClaim && !faucet.canRetry}
          onClick={() =>
            void (faucet.canRetry ? faucet.retry() : faucet.claim())
          }
          type="button"
        >
          {faucet.canRetry
            ? "Retry"
            : faucet.status === "pending"
              ? "Claim pending…"
              : `Claim 100 ${DISPLAY_ASSET_SYMBOL}`}
        </button>
      ) : null}
    </div>
  );
}
