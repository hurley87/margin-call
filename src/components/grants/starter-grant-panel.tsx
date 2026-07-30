"use client";

import { useEffect, useState } from "react";
import { useAction, useQuery } from "convex/react";
import { useReadContract } from "wagmi";

import { api } from "../../../convex/_generated/api";
import { GameButton } from "@/components/ui/game-button";
import { mockUsdAbi } from "@/lib/contracts/abis";
import { getMockUsdAddress } from "@/lib/contracts/addresses";
import { formatMockUsd } from "@/lib/grants/starter-grant-policy";

type Props = {
  walletAddress: string;
};

function formatCountdown(availableAt: number, now: number): string {
  const ms = Math.max(0, availableAt - now);
  const totalSec = Math.ceil(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  const s = totalSec % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

export function StarterGrantPanel({ walletAddress }: Props) {
  const status = useQuery(api.starterGrants.getStatus, { walletAddress });
  const claimGrant = useAction(api.starterGrantActions.claimStarterGrant);
  const claimRefill = useAction(api.starterGrantActions.claimRefill);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const mockUsd = getMockUsdAddress();

  const { data: balance, refetch: refetchBalance } = useReadContract({
    address: mockUsd,
    abi: mockUsdAbi,
    functionName: "balanceOf",
    args: [walletAddress as `0x${string}`],
    query: { enabled: Boolean(mockUsd && walletAddress) },
  });

  const countingDown =
    status?.hasGrant === true &&
    status.refillAvailableAt !== null &&
    now < status.refillAvailableAt;

  // Only tick while a refill countdown is live; stop once it's ready.
  useEffect(() => {
    if (!countingDown) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [countingDown]);

  const needsGrant = status != null && !status.hasGrant;

  useEffect(() => {
    if (!walletAddress || !needsGrant) return;
    let cancelled = false;
    (async () => {
      setBusy(true);
      setError(null);
      try {
        await claimGrant({ walletAddress });
        if (!cancelled) await refetchBalance();
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Grant failed");
        }
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [walletAddress, needsGrant, claimGrant, refetchBalance]);

  const displayBalance =
    balance === undefined ? "…" : `$${formatMockUsd(Number(balance))}`;

  const refillReady =
    status?.hasGrant === true &&
    status.refillAvailableAt !== null &&
    now >= status.refillAvailableAt;

  async function onRefill() {
    setBusy(true);
    setError(null);
    try {
      const result = await claimRefill({ walletAddress });
      if (result.kind === "cooldown") {
        setError("Refill still cooling down");
      }
      await refetchBalance();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Refill failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-8 space-y-3 text-sm leading-6 text-[var(--t-text)]/92">
      <p>
        MockUSD balance:{" "}
        <span className="text-[var(--t-accent)]">{displayBalance}</span>
      </p>
      {status === undefined && (
        <p className="text-[var(--t-muted)]">Loading grant…</p>
      )}
      {status && !status.hasGrant && (
        <p className="text-[var(--t-muted)]">
          {busy ? "Claiming Starter Grant…" : "Starter Grant pending…"}
        </p>
      )}
      {status?.hasGrant && (
        <p className="text-[var(--t-green)]">
          Starter Grant received (${formatMockUsd(status.grantAmount)})
        </p>
      )}
      {status?.hasGrant && status.refillAvailableAt !== null && (
        <div className="flex flex-wrap items-center gap-3">
          <GameButton
            onClick={onRefill}
            disabled={busy || !refillReady}
            variant="secondary"
            size="sm"
          >
            {refillReady
              ? `[REFILL $${formatMockUsd(status.refillAmount)}]`
              : `[REFILL IN ${formatCountdown(status.refillAvailableAt, now)}]`}
          </GameButton>
        </div>
      )}
      {error && <p className="text-red-400">{error}</p>}
    </div>
  );
}
