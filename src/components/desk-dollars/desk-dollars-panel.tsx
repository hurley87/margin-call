"use client";

import { usePrivy } from "@privy-io/react-auth";
import { FlashValue } from "@/components/ui/flash-value";
import {
  DISPLAY_ASSET_SYMBOL,
  formatDeskDollarsBalanceLabel,
} from "@/lib/desk-dollars";
import { getEvmWalletAddress } from "@/lib/privy/wallet";
import {
  getDeskDollarsFaucetChrome,
  useDeskDollarsFaucet,
} from "@/hooks/use-desk-dollars-faucet";

function formatCooldown(seconds: bigint) {
  const minutes = Number((seconds + 59n) / 60n);
  return `${minutes} minute${minutes === 1 ? "" : "s"}`;
}

export function DeskDollarsPanel() {
  const { user } = usePrivy();
  const walletAddress = getEvmWalletAddress(user);
  const faucet = useDeskDollarsFaucet(walletAddress);
  const balance =
    formatDeskDollarsBalanceLabel(faucet.balance, faucet.decimals) ??
    `— ${DISPLAY_ASSET_SYMBOL}`;
  const chrome = getDeskDollarsFaucetChrome({
    balance: faucet.balance,
    status: faucet.status,
    canRetry: faucet.canRetry,
  });

  return (
    <section
      aria-labelledby="desk-dollars-heading"
      className="mt-8 rounded-sm border border-[var(--t-muted)] p-5 text-left"
    >
      <h2
        id="desk-dollars-heading"
        className="font-bold text-[var(--t-accent)]"
      >
        Desk Dollars ({DISPLAY_ASSET_SYMBOL})
      </h2>
      <p className="mt-2 text-sm text-[var(--t-text)]">
        Balance:{" "}
        {faucet.balance !== null ? (
          <FlashValue value={faucet.balance}>{balance}</FlashValue>
        ) : (
          balance
        )}
      </p>
      <p className="mt-2 text-xs text-[var(--t-muted)]">
        Base Sepolia only. Desk Dollars have no real value.
      </p>
      {faucet.status === "unavailable" ? (
        <p role="alert" className="mt-3 text-sm">
          {faucet.error}
        </p>
      ) : null}
      {faucet.status === "loading" ? (
        <p aria-live="polite" className="mt-3 text-sm">
          Loading Desk Dollars balance…
        </p>
      ) : null}
      {faucet.status === "pending" ? (
        <p aria-live="polite" className="mt-3 text-sm">
          Claim pending until its Base Sepolia receipt succeeds…
        </p>
      ) : null}
      {faucet.status === "confirmed" ? (
        <p aria-live="polite" className="mt-3 text-sm">
          Desk Dollars claim confirmed on Base Sepolia.
        </p>
      ) : null}
      {faucet.status === "error" ? (
        <p role="alert" className="mt-3 text-sm">
          {faucet.error}
        </p>
      ) : null}
      {chrome.showOffer && !faucet.eligible ? (
        <p className="mt-3 text-sm">
          Next 100 {DISPLAY_ASSET_SYMBOL} faucet claim in{" "}
          {formatCooldown(faucet.cooldownSeconds)}.
        </p>
      ) : null}
      {chrome.showOffer && faucet.eligible ? (
        <p className="mt-3 text-sm">
          Eligible to claim 100 {DISPLAY_ASSET_SYMBOL} from the faucet.
        </p>
      ) : null}
      {chrome.showClaimButton ? (
        <button
          className="mt-4 rounded-sm bg-[var(--t-accent)] px-4 py-2 text-sm font-bold text-[var(--t-bg)] disabled:opacity-50"
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
    </section>
  );
}
