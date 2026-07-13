"use client";

import { useState, type FormEvent } from "react";
import { Check } from "lucide-react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { DatumCell } from "@/components/datum-cell";
import { SeatTierBadgeView } from "@/components/seat-tier-badge";
import { useSecondTick } from "@/hooks/use-second-tick";
import {
  useBlowBalance,
  useSeatVaultFlows,
  useTraderDepositor,
  seatVaultStepLabel,
} from "@/hooks/use-seat-vault";
import { useBaseNetwork } from "@/hooks/use-base-network";
import {
  capacityForTier,
  CORNER_OFFICE_THRESHOLD_WEI,
  formatBlowAmount,
  SEAT_THRESHOLD_WEI,
  SEAT_VAULT_ADDRESS,
  type SeatTierName,
} from "@/lib/contracts/seatVault";
import {
  canCompleteWithdrawal,
  canInitiateUnstake,
  canPostPrincipal,
  formatUnlockCountdown,
  isCooldownActive,
  isLapsedSeat,
  SEAT_TIER_FLOOR_LABEL,
} from "@/lib/seat-tier-display";
import { cn } from "@/lib/utils";

type SeatStateRow = {
  traderId: Id<"traders">;
  onChainTraderId: number;
  vaultAddress: string;
  vaultVersion: number;
  isActiveVault: boolean;
  effectiveTier: SeatTierName;
  staker: string | null;
  activeAmountWei: string;
  pendingAmountWei: string;
  unlockTime: number;
  syncStatus: "ok" | "syncing" | "error";
  syncError: string | null;
  cycleIntervalMs: number;
  maxUnresolvedEntries: number;
};

function formatWeiOrDash(wei: string): string {
  try {
    return formatBlowAmount(wei);
  } catch {
    return "—";
  }
}

/** Floor ladder, cheapest first — drives the one-click tier picker. */
const TIER_LADDER: { tier: SeatTierName; thresholdWei: string }[] = [
  { tier: "Gallery", thresholdWei: "0" },
  { tier: "Seat", thresholdWei: SEAT_THRESHOLD_WEI },
  { tier: "CornerOffice", thresholdWei: CORNER_OFFICE_THRESHOLD_WEI },
];

function tierCapacityLabel(tier: SeatTierName): string {
  const cap = capacityForTier(tier);
  return `${Math.round(cap.cycleIntervalMs / 60_000)}m cadence · ${cap.maxUnresolvedEntries} open`;
}

function sectionTitle(title: string) {
  return (
    <h2 className="text-xs uppercase tracking-[0.2em] text-[var(--t-muted)]">
      {title}
    </h2>
  );
}

export function SeatStakePanel({
  traderId,
  onChainTraderId,
}: {
  traderId: string;
  onChainTraderId: number;
}) {
  const convexId = traderId as Id<"traders">;
  const nowMs = useSecondTick();
  const nowSeconds = Math.floor(nowMs / 1000);

  const seatState = useQuery(api.seatVault.queries.getTraderSeatState, {
    traderId: convexId,
  }) as SeatStateRow | null | undefined;

  const vaultRows = useQuery(api.seatVault.queries.listTraderVaultWithdrawals, {
    traderId: convexId,
  }) as SeatStateRow[] | undefined;

  const {
    balanceWei,
    walletAddress,
    refetch: refetchBalance,
  } = useBlowBalance();
  const { depositor } = useTraderDepositor(onChainTraderId);
  const { isWrongNetwork, switchToBase, isSwitching } = useBaseNetwork();
  const {
    stake,
    initiateUnstake,
    completeUnstake,
    reset,
    step,
    error,
    isLoading,
  } = useSeatVaultFlows();

  const [stakeAmount, setStakeAmount] = useState("");
  const [unstakeAmount, setUnstakeAmount] = useState("");
  const [localError, setLocalError] = useState<string | undefined>();

  const active = seatState ?? null;
  const currentTier: SeatTierName = active?.effectiveTier ?? "Gallery";
  const activeWei = BigInt(active?.activeAmountWei ?? "0");
  const balanceBig =
    balanceWei !== undefined ? BigInt(balanceWei.toString()) : undefined;

  const canStake = canPostPrincipal({
    walletAddress,
    depositorAddress: depositor,
    isActiveVault: active?.isActiveVault ?? true,
  });

  const canPull = active
    ? canInitiateUnstake({
        walletAddress,
        stakerAddress: active.staker,
        activeWei: active.activeAmountWei,
      })
    : false;

  const pendingVaults = (vaultRows ?? []).filter(
    (row) => BigInt(row.pendingAmountWei) > BigInt(0)
  );

  const lapsed =
    active != null &&
    isLapsedSeat(active.activeAmountWei, active.pendingAmountWei);

  const balanceHuman =
    balanceWei !== undefined ? formatBlowAmount(balanceWei.toString()) : "…";

  const displayError = localError ?? error;

  async function postPrincipal(amountHuman: string) {
    setLocalError(undefined);
    if (!walletAddress) {
      setLocalError("Connect the desk treasury wallet first.");
      return;
    }
    if (isWrongNetwork) {
      setLocalError("Wrong chain — switch to Base Sepolia.");
      return;
    }
    try {
      await stake({
        convexTraderId: convexId,
        onChainTraderId,
        amountHuman,
        vaultAddress: (active?.vaultAddress ||
          SEAT_VAULT_ADDRESS) as `0x${string}`,
        depositor,
      });
      setStakeAmount("");
      void refetchBalance();
      reset();
    } catch {
      // surfaced via hook
    }
  }

  async function handleStake(e: FormEvent) {
    e.preventDefault();
    await postPrincipal(stakeAmount);
  }

  async function handleInitiate(e: FormEvent) {
    e.preventDefault();
    setLocalError(undefined);
    if (!active) return;
    try {
      await initiateUnstake({
        convexTraderId: convexId,
        onChainTraderId,
        amountHuman: unstakeAmount,
        vaultAddress: active.vaultAddress as `0x${string}`,
        activeWei: active.activeAmountWei,
        staker: active.staker,
      });
      setUnstakeAmount("");
      reset();
    } catch {
      // surfaced via hook
    }
  }

  async function handleComplete(row: SeatStateRow) {
    setLocalError(undefined);
    try {
      await completeUnstake({
        convexTraderId: convexId,
        onChainTraderId: row.onChainTraderId,
        vaultAddress: row.vaultAddress as `0x${string}`,
        pendingWei: row.pendingAmountWei,
        unlockTime: row.unlockTime,
      });
      void refetchBalance();
      reset();
    } catch {
      // surfaced via hook
    }
  }

  if (seatState === undefined) {
    return (
      <section className="border border-[var(--t-divider)] bg-[#070b09] p-4">
        {sectionTitle("Floor seat")}
        <p className="mt-3 text-xs uppercase tracking-[0.16em] text-[var(--t-muted)]">
          Checking the book…
        </p>
      </section>
    );
  }

  return (
    <section className="overflow-hidden border border-[var(--t-divider)] bg-[#070b09]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--t-divider)] p-3">
        {sectionTitle("Floor seat · $BLOW principal")}
        <SeatTierBadgeView
          tier={active?.effectiveTier ?? "Gallery"}
          syncStatus={active?.syncStatus}
        />
      </div>

      <div className="grid sm:grid-cols-3">
        <DatumCell
          label="Active principal"
          value={`${formatWeiOrDash(active?.activeAmountWei ?? "0")} $BLOW`}
          className="border-0 border-b border-[var(--t-divider)] sm:border-b-0 sm:border-r"
        />
        <DatumCell
          label="Pending in cage"
          value={`${formatWeiOrDash(active?.pendingAmountWei ?? "0")} $BLOW`}
          className="border-0 border-b border-[var(--t-divider)] sm:border-b-0 sm:border-r"
          valueClassName={
            active && BigInt(active.pendingAmountWei) > BigInt(0)
              ? "text-[var(--t-amber)]"
              : undefined
          }
        />
        <DatumCell
          label="Cadence / open tickets"
          value={`${Math.round((active?.cycleIntervalMs ?? capacityForTier("Gallery").cycleIntervalMs) / 60_000)}m · ${active?.maxUnresolvedEntries ?? capacityForTier("Gallery").maxUnresolvedEntries}`}
          className="border-0"
        />
      </div>

      <div className="space-y-3 border-t border-[var(--t-divider)] p-4">
        {lapsed ? (
          <p className="text-xs uppercase tracking-[0.14em] text-[var(--t-amber)]">
            Lapsed seat — active principal sits below the Seat line while chips
            wait in the cage. Capacity reads Gallery until you post again.
          </p>
        ) : null}

        <p className="text-[10px] uppercase tracking-[0.16em] text-[var(--t-muted)]">
          Desk $BLOW:{" "}
          <span className="text-[var(--t-text)]">{balanceHuman}</span>
          {isWrongNetwork ? (
            <>
              {" · "}
              <button
                type="button"
                onClick={() => void switchToBase()}
                disabled={isSwitching}
                className="text-[var(--t-amber)] underline-offset-2 hover:underline"
              >
                {isSwitching ? "Switching…" : "Switch to Base Sepolia"}
              </button>
            </>
          ) : null}
        </p>

        {canStake ? (
          <div className="space-y-3">
            <p className="text-[10px] uppercase tracking-[0.18em] text-[var(--t-muted)]">
              Choose your floor
            </p>
            <div className="grid gap-2 sm:grid-cols-3">
              {TIER_LADDER.map((entry) => {
                const thresholdWei = BigInt(entry.thresholdWei);
                const cleared = activeWei >= thresholdWei;
                const deltaWei = cleared ? BigInt(0) : thresholdWei - activeWei;
                const deltaHuman = formatBlowAmount(deltaWei.toString());
                const affordable =
                  balanceBig !== undefined && balanceBig >= deltaWei;
                const isCurrent = currentTier === entry.tier;
                const isGallery = entry.tier === "Gallery";
                return (
                  <div
                    key={entry.tier}
                    className={cn(
                      "flex flex-col gap-1.5 border p-3",
                      isCurrent
                        ? "border-[var(--t-amber)] bg-[var(--t-amber)]/5"
                        : "border-[var(--t-divider)] bg-[var(--t-bg)]/40"
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--t-text)]">
                        {SEAT_TIER_FLOOR_LABEL[entry.tier]}
                      </span>
                      {isCurrent ? (
                        <span className="text-[9px] font-bold uppercase tracking-[0.16em] text-[var(--t-amber)]">
                          Current
                        </span>
                      ) : cleared ? (
                        <Check className="h-3.5 w-3.5 text-[var(--t-green)]" />
                      ) : null}
                    </div>
                    <p className="text-[10px] uppercase tracking-[0.14em] text-[var(--t-muted)]">
                      {isGallery
                        ? "Free floor"
                        : `${formatBlowAmount(entry.thresholdWei)} $BLOW`}
                    </p>
                    <p className="text-[10px] uppercase tracking-[0.1em] text-[var(--t-muted)]">
                      {tierCapacityLabel(entry.tier)}
                    </p>
                    <div className="mt-auto pt-1.5">
                      {isGallery || cleared ? (
                        <p
                          className={cn(
                            "text-[10px] font-bold uppercase tracking-[0.14em]",
                            isCurrent
                              ? "text-[var(--t-amber)]"
                              : "text-[var(--t-green)]"
                          )}
                        >
                          {isCurrent
                            ? "Seated here"
                            : cleared
                              ? "Cleared"
                              : "Base floor"}
                        </p>
                      ) : (
                        <button
                          type="button"
                          disabled={isLoading || !affordable}
                          onClick={() => void postPrincipal(deltaHuman)}
                          title={
                            affordable
                              ? `Post ${deltaHuman} $BLOW to take the ${SEAT_TIER_FLOOR_LABEL[entry.tier]}`
                              : `Need ${deltaHuman} $BLOW — desk holds ${balanceHuman}`
                          }
                          className="w-full border border-[var(--t-amber)]/60 bg-[var(--t-amber)]/10 px-2 py-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--t-amber)] transition-colors hover:bg-[var(--t-amber)]/20 disabled:opacity-40"
                        >
                          {affordable
                            ? `Post ${deltaHuman} $BLOW`
                            : `Need ${deltaHuman} $BLOW`}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <form
              onSubmit={handleStake}
              className="flex flex-wrap items-end gap-2 border-t border-[var(--t-divider)] pt-3"
            >
              <label className="min-w-[10rem] flex-1">
                <span className="mb-1 block text-[10px] uppercase tracking-[0.16em] text-[var(--t-muted)]">
                  Custom top-up
                </span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={stakeAmount}
                  onChange={(e) => setStakeAmount(e.target.value)}
                  placeholder="0"
                  disabled={isLoading}
                  className="w-full border border-[var(--t-divider)] bg-[var(--t-bg)] px-3 py-2 font-mono text-sm text-[var(--t-text)] outline-none focus:border-[var(--t-amber)]"
                />
              </label>
              <button
                type="submit"
                disabled={isLoading || !stakeAmount.trim()}
                className="min-h-10 border border-[var(--t-divider)] px-4 text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--t-text)] transition-colors hover:border-[var(--t-amber)] hover:text-[var(--t-amber)] disabled:opacity-40"
              >
                Post $BLOW
              </button>
            </form>
          </div>
        ) : (
          <p className="text-[10px] uppercase tracking-[0.14em] text-[var(--t-muted)]">
            {!walletAddress
              ? "Connect desk treasury to post principal."
              : !depositor
                ? "Fund escrow first — depositor must be on file before a seat posts."
                : depositor.toLowerCase() !== walletAddress.toLowerCase()
                  ? "This wallet is not the depositor. Withdrawals from old stakes may still clear below."
                  : "Active vault only accepts new principal from the assigned depositor."}
          </p>
        )}

        {canPull && active ? (
          <form
            onSubmit={handleInitiate}
            className="flex flex-wrap items-end gap-2 border-t border-[var(--t-divider)] pt-3"
          >
            <label className="min-w-[10rem] flex-1">
              <span className="mb-1 block text-[10px] uppercase tracking-[0.16em] text-[var(--t-muted)]">
                Pull principal (24h cage)
              </span>
              <input
                type="text"
                inputMode="decimal"
                value={unstakeAmount}
                onChange={(e) => setUnstakeAmount(e.target.value)}
                placeholder="0"
                disabled={isLoading}
                className="w-full border border-[var(--t-divider)] bg-[var(--t-bg)] px-3 py-2 font-mono text-sm text-[var(--t-text)] outline-none focus:border-[var(--t-amber)]"
              />
            </label>
            <button
              type="button"
              disabled={isLoading}
              onClick={() =>
                setUnstakeAmount(formatWeiOrDash(active.activeAmountWei))
              }
              className="min-h-10 border border-[var(--t-divider)] px-3 text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--t-muted)] hover:text-[var(--t-text)]"
            >
              Max
            </button>
            <button
              type="submit"
              disabled={isLoading || !unstakeAmount.trim()}
              className="min-h-10 border border-[var(--t-divider)] px-4 text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--t-text)] transition-colors hover:border-[var(--t-amber)] hover:text-[var(--t-amber)] disabled:opacity-40"
            >
              File pull
            </button>
          </form>
        ) : null}

        {pendingVaults.length > 0 ? (
          <div className="space-y-2 border-t border-[var(--t-divider)] pt-3">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--t-muted)]">
              Cage withdrawals
            </p>
            {pendingVaults.map((row) => {
              const cooling = isCooldownActive(
                row.unlockTime,
                row.pendingAmountWei,
                nowSeconds
              );
              const ready = canCompleteWithdrawal({
                pendingWei: row.pendingAmountWei,
                unlockTimeSeconds: row.unlockTime,
                nowSeconds,
              });
              return (
                <div
                  key={`${row.vaultAddress}:${row.vaultVersion}`}
                  className="flex flex-wrap items-center justify-between gap-3 border border-[var(--t-divider)] bg-[var(--t-bg)]/40 px-3 py-2"
                >
                  <div className="min-w-0 text-[10px] uppercase tracking-[0.14em] text-[var(--t-muted)]">
                    <p>
                      Vault v{row.vaultVersion}
                      {!row.isActiveVault ? (
                        <span className="ml-2 text-[var(--t-amber)]">
                          prior book · no capacity
                        </span>
                      ) : null}
                    </p>
                    <p className="mt-1 text-[var(--t-text)]">
                      {formatWeiOrDash(row.pendingAmountWei)} $BLOW ·{" "}
                      {cooling
                        ? `Unlock ${formatUnlockCountdown(row.unlockTime, nowSeconds)}`
                        : ready
                          ? "Ready for release"
                          : "—"}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={isLoading || !ready}
                    onClick={() => void handleComplete(row)}
                    className={cn(
                      "min-h-9 border px-3 text-[10px] font-bold uppercase tracking-[0.16em] transition-colors disabled:opacity-40",
                      ready
                        ? "border-[var(--t-green)]/50 text-[var(--t-green)] hover:bg-[var(--t-green)]/10"
                        : "border-[var(--t-divider)] text-[var(--t-muted)]"
                    )}
                  >
                    {ready ? "Complete withdrawal" : "Cage locked"}
                  </button>
                </div>
              );
            })}
          </div>
        ) : null}

        {isLoading || step === "done" ? (
          <p className="text-[10px] uppercase tracking-[0.16em] text-[var(--t-green)]">
            {seatVaultStepLabel(step)}
          </p>
        ) : null}

        {displayError ? (
          <p className="text-xs text-[var(--t-red)]" role="alert">
            {displayError}
          </p>
        ) : null}

        {active?.syncStatus === "error" && active.syncError ? (
          <p className="text-[10px] uppercase tracking-[0.14em] text-[var(--t-amber)]">
            Book lag: {active.syncError}
          </p>
        ) : null}

        <p className="text-[10px] leading-relaxed tracking-[0.04em] text-[var(--t-muted)]">
          Principal sets desk cadence and open-ticket capacity only. No yield,
          no dividends, no payout promises — just a seat on the floor.
        </p>
      </div>
    </section>
  );
}

/** Narrow export for static markup tests without Convex/wagmi. */
export function SeatStakePanelStatic({
  tier,
  activeHuman,
  pendingHuman,
  nextTierDeltaHuman,
  nextTierLabel,
  showControls,
  showPendingDetails,
  cooldownLabel,
  canComplete,
  vaultVersionLabel,
  error,
}: {
  tier: SeatTierName;
  activeHuman: string;
  pendingHuman: string;
  nextTierDeltaHuman?: string;
  nextTierLabel?: string;
  showControls: boolean;
  showPendingDetails: boolean;
  cooldownLabel?: string;
  canComplete?: boolean;
  vaultVersionLabel?: string;
  error?: string;
}) {
  return (
    <section className="border border-[var(--t-divider)] bg-[#070b09] p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xs uppercase tracking-[0.2em] text-[var(--t-muted)]">
          Floor seat · $BLOW principal
        </h2>
        <SeatTierBadgeView tier={tier} />
      </div>
      <p className="mt-3 text-xs uppercase tracking-[0.14em] text-[var(--t-text)]">
        Active {activeHuman} $BLOW
      </p>
      {showPendingDetails ? (
        <p className="mt-1 text-xs uppercase tracking-[0.14em] text-[var(--t-amber)]">
          Pending {pendingHuman} $BLOW
          {cooldownLabel ? ` · ${cooldownLabel}` : null}
        </p>
      ) : null}
      {nextTierDeltaHuman && nextTierLabel ? (
        <p className="mt-2 text-xs uppercase tracking-[0.14em] text-[var(--t-muted)]">
          Need {nextTierDeltaHuman} $BLOW for {nextTierLabel}
        </p>
      ) : null}
      {showControls ? (
        <div className="mt-3 flex gap-2">
          <button type="button">Post $BLOW</button>
          <button type="button">File pull</button>
          {canComplete ? (
            <button type="button">Complete withdrawal</button>
          ) : (
            <button type="button" disabled>
              Cage locked
            </button>
          )}
        </div>
      ) : (
        <p className="mt-3 text-[10px] uppercase tracking-[0.14em] text-[var(--t-muted)]">
          Public view — management locked
        </p>
      )}
      {vaultVersionLabel ? (
        <p className="mt-2 text-[10px] uppercase tracking-[0.14em] text-[var(--t-amber)]">
          {vaultVersionLabel}
        </p>
      ) : null}
      {error ? (
        <p className="mt-2 text-xs text-[var(--t-red)]" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}
