"use client";

import { useState } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { parseUnits } from "viem";
import { useDepositFlow, useWithdrawFlow } from "@/hooks/use-escrow";
import { WalletProvisioningError } from "@/components/wallet-provisioning-error";
import { authFetch } from "@/lib/api";
import { DIALOG_BACKDROP_CLASS, formatUsdc } from "@/lib/utils";
import { AnimatedNumber } from "@/components/animated-number";
import type { Doc, Id } from "../../../convex/_generated/dataModel";

const ZERO = BigInt(0);

/** USDC micros for inputs + Max; avoids float noise and matches `parseUnits(_, 6)`. */
function usdcToInputString(usdc: number): string {
  const micros = Math.round(usdc * 1_000_000);
  return (micros / 1_000_000).toFixed(6).replace(/\.?0+$/, "") || "0";
}

interface WalletDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Convex document ID — used for the ensure-depositor pre-flight. */
  convexTraderId: string;
  /** ERC-8004 token ID — used as the escrow traderId on-chain. */
  traderId: number;
  walletUsdc: number | undefined;
  escrowUsdc: number | null;
  walletAddress: string | null;
  ownerAddress: string;
  walletStatus: Doc<"traders">["walletStatus"];
  walletError: string | null;
  isNewTrader: boolean;
  onSuccess: () => void;
}

export function WalletDialog({
  open,
  onOpenChange,
  convexTraderId,
  traderId,
  walletUsdc,
  escrowUsdc,
  walletAddress,
  ownerAddress,
  walletStatus,
  walletError,
  isNewTrader,
  onSuccess,
}: WalletDialogProps) {
  const [mode, setMode] = useState<"deposit" | "withdraw">("deposit");
  const [amount, setAmount] = useState("");
  const [ensureError, setEnsureError] = useState<string | undefined>();
  const [syncError, setSyncError] = useState<string | undefined>();

  const {
    deposit,
    reset: resetDeposit,
    step: depositStep,
    error: depositError,
    isLoading: isDepositBusy,
  } = useDepositFlow();
  const {
    withdraw,
    reset: resetWithdraw,
    busy: withdrawBusy,
    done: withdrawDone,
    error: withdrawError,
  } = useWithdrawFlow();

  function switchMode(next: "deposit" | "withdraw") {
    setMode(next);
    setAmount("");
    setEnsureError(undefined);
    setSyncError(undefined);
  }

  async function syncBalance() {
    const syncRes = await authFetch(
      `/api/trader/${convexTraderId}/sync-balance`,
      { method: "POST" }
    );
    if (!syncRes.ok) {
      const body = await syncRes.json().catch(() => ({}));
      setSyncError(
        (body as { error?: string }).error ??
          "Transaction confirmed, but balance sync failed"
      );
      return false;
    }
    return true;
  }

  async function handleDeposit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = parseUnits(amount, 6);
    if (parsed === ZERO) return;
    setEnsureError(undefined);
    setSyncError(undefined);

    // Skip pre-flight if escrow already has funds — depositor is confirmed set.
    if (!escrowUsdc) {
      try {
        const res = await authFetch(
          `/api/trader/${convexTraderId}/ensure-depositor`,
          { method: "POST" }
        );
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          setEnsureError((body as { error?: string }).error ?? "Setup failed");
          return;
        }
      } catch {
        setEnsureError("Network error during depositor setup");
        return;
      }
    }

    try {
      await deposit(BigInt(traderId), parsed);
      if (!(await syncBalance())) return;
      setAmount("");
      onSuccess();
    } catch {
      // error surfaced via hook state
    }
  }

  const withdrawExceedsBalance =
    escrowUsdc !== null &&
    amount !== "" &&
    (() => {
      try {
        return (
          parseUnits(amount, 6) > parseUnits(usdcToInputString(escrowUsdc), 6)
        );
      } catch {
        return false;
      }
    })();

  async function handleWithdraw(e: React.FormEvent) {
    e.preventDefault();
    const parsed = parseUnits(amount, 6);
    if (parsed === ZERO) return;
    if (withdrawExceedsBalance) return;
    setSyncError(undefined);

    try {
      await withdraw(BigInt(traderId), parsed);
      if (!(await syncBalance())) return;
      setAmount("");
      onSuccess();
    } catch {
      // error surfaced via hook state
    }
  }

  const showWelcome = isNewTrader && (escrowUsdc === null || escrowUsdc === 0);
  const depositDisplayError = ensureError ?? syncError ?? depositError;
  const withdrawDisplayError = syncError ?? withdrawError;

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className={DIALOG_BACKDROP_CLASS} />
        <Dialog.Popup className="fixed left-1/2 top-1/2 z-50 w-[92vw] max-w-md -translate-x-1/2 -translate-y-1/2 border border-[var(--t-border)] bg-[var(--t-bg)] font-mono shadow-2xl shadow-black/60">
          {/* Header */}
          <div className="flex items-center justify-between gap-3 border-b border-[var(--t-border)] bg-[var(--t-surface)] px-4 py-3">
            <div>
              <p className="text-[10px] uppercase tracking-[0.2em] text-[var(--t-muted)]">
                Trader cashier
              </p>
              <h2 className="font-[family-name:var(--font-plex-sans)] text-base font-black uppercase tracking-wide text-[var(--t-amber)]">
                Escrow wallet
              </h2>
            </div>
            <Dialog.Close className="min-h-10 shrink-0 px-2 text-xs uppercase tracking-[0.18em] text-[var(--t-muted)] transition-colors hover:text-[var(--t-text)] focus:text-[var(--t-accent)] focus:outline-none">
              Close
            </Dialog.Close>
          </div>

          {/* Balance display */}
          <div className="border-b border-[var(--t-border)] px-4 py-4 text-center">
            <p className="text-[10px] uppercase tracking-wider text-[var(--t-muted)]">
              TRADER BALANCE
            </p>
            <p className="mt-1 text-2xl font-semibold text-[var(--t-text)]">
              {escrowUsdc !== null ? (
                <AnimatedNumber value={escrowUsdc} format={formatUsdc} live />
              ) : (
                "$..."
              )}
            </p>
            {showWelcome && (
              <div className="mx-auto mt-3 max-w-xs border border-[var(--t-amber)]/40 bg-[var(--t-amber)]/5 px-3 py-2">
                <p className="text-xs text-[var(--t-amber)]">
                  Fund your trader&apos;s escrow to begin trading
                </p>
              </div>
            )}
          </div>

          {/* Deposit / Withdraw tabs */}
          <div className="flex border-b border-[var(--t-border)]">
            <button
              onClick={() => switchMode("deposit")}
              className={`flex-1 py-2 text-center text-xs transition-colors ${
                mode === "deposit"
                  ? "border-b-2 border-[var(--t-accent)] text-[var(--t-accent)]"
                  : "text-[var(--t-muted)] hover:text-[var(--t-text)]"
              }`}
            >
              Deposit
            </button>
            <button
              onClick={() => switchMode("withdraw")}
              className={`flex-1 py-2 text-center text-xs transition-colors ${
                mode === "withdraw"
                  ? "border-b-2 border-[var(--t-accent)] text-[var(--t-accent)]"
                  : "text-[var(--t-muted)] hover:text-[var(--t-text)]"
              }`}
            >
              Withdraw
            </button>
          </div>

          {/* Deposit form */}
          {mode === "deposit" &&
            (traderId === 0 ? (
              <div className="px-4 py-4">
                <p className="text-xs text-[var(--t-amber)]">
                  Wallet setup in progress — deposit will be available shortly.
                </p>
                {walletStatus === "error" && (
                  <WalletProvisioningError
                    traderId={convexTraderId as Id<"traders">}
                    walletError={walletError}
                    className="mt-3"
                  />
                )}
              </div>
            ) : (
              <form
                onSubmit={handleDeposit}
                className="flex flex-col gap-3 px-4 py-4"
              >
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    step="0.000001"
                    min="0"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0.00 USDC"
                    disabled={isDepositBusy}
                    className="min-h-11 w-full border border-[var(--t-border)] bg-[var(--t-bg)] px-3 py-2 text-base text-[var(--t-text)] placeholder-[var(--t-muted)] focus:border-[var(--t-accent)] focus:outline-none disabled:opacity-50 sm:text-sm"
                  />
                  {walletUsdc !== undefined && walletUsdc > 0 && (
                    <button
                      type="button"
                      onClick={() => setAmount(usdcToInputString(walletUsdc))}
                      className="min-h-10 shrink-0 px-2 text-xs text-[var(--t-accent)] hover:underline focus:text-[var(--t-text)] focus:outline-none"
                    >
                      Max
                    </button>
                  )}
                </div>
                <button
                  type="submit"
                  disabled={isDepositBusy || !amount}
                  className="min-h-11 border border-[var(--t-accent)] bg-[var(--t-surface)] px-4 py-2 text-sm font-medium text-[var(--t-accent)] transition-colors hover:bg-[var(--t-accent)] hover:text-[var(--t-bg)] focus:bg-[var(--t-accent)] focus:text-[var(--t-bg)] focus:outline-none disabled:opacity-50"
                >
                  {depositStep === "approving"
                    ? "Approving USDC..."
                    : depositStep === "depositing"
                      ? "Depositing..."
                      : isNewTrader && showWelcome
                        ? "FUND ESCROW"
                        : "Deposit"}
                </button>
                {depositStep === "done" && (
                  <p className="text-xs text-[var(--t-green)]">
                    Deposit confirmed.
                  </p>
                )}
                {depositDisplayError && (
                  <div className="flex items-center gap-2">
                    <p className="text-xs text-[var(--t-red)]">
                      {depositDisplayError.slice(0, 120)}
                    </p>
                    {depositError && !ensureError && (
                      <button
                        type="button"
                        onClick={resetDeposit}
                        className="min-h-10 px-2 text-xs text-[var(--t-muted)] underline hover:text-[var(--t-text)] focus:text-[var(--t-accent)] focus:outline-none"
                      >
                        Retry
                      </button>
                    )}
                  </div>
                )}
              </form>
            ))}

          {/* Withdraw form */}
          {mode === "withdraw" && (
            <form
              onSubmit={handleWithdraw}
              className="flex flex-col gap-3 px-4 py-4"
            >
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  step="0.000001"
                  min="0"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00 USDC"
                  disabled={withdrawBusy}
                  className="min-h-11 w-full border border-[var(--t-border)] bg-[var(--t-bg)] px-3 py-2 text-base text-[var(--t-text)] placeholder-[var(--t-muted)] focus:border-[var(--t-accent)] focus:outline-none disabled:opacity-50 sm:text-sm"
                />
                {escrowUsdc !== null && escrowUsdc > 0 && (
                  <button
                    type="button"
                    onClick={() => setAmount(usdcToInputString(escrowUsdc))}
                    className="min-h-10 shrink-0 px-2 text-xs text-[var(--t-accent)] hover:underline focus:text-[var(--t-text)] focus:outline-none"
                  >
                    Max
                  </button>
                )}
              </div>
              {withdrawExceedsBalance && (
                <p className="text-xs text-[var(--t-red)]">
                  Exceeds escrow balance (${escrowUsdc?.toFixed(2)})
                </p>
              )}
              <button
                type="submit"
                disabled={withdrawBusy || !amount || withdrawExceedsBalance}
                className="min-h-11 border border-[var(--t-accent)] bg-[var(--t-surface)] px-4 py-2 text-sm font-medium text-[var(--t-accent)] transition-colors hover:bg-[var(--t-accent)] hover:text-[var(--t-bg)] focus:bg-[var(--t-accent)] focus:text-[var(--t-bg)] focus:outline-none disabled:opacity-50"
              >
                {withdrawBusy ? "Withdrawing..." : "Withdraw"}
              </button>
              {withdrawDone && (
                <p className="text-xs text-[var(--t-green)]">
                  Withdrawal confirmed.
                </p>
              )}
              {withdrawDisplayError && (
                <div className="flex items-center gap-2">
                  <p className="text-xs text-[var(--t-red)]">
                    {withdrawDisplayError.slice(0, 120)}
                  </p>
                  {withdrawError && !syncError && (
                    <button
                      type="button"
                      onClick={resetWithdraw}
                      className="min-h-10 px-2 text-xs text-[var(--t-muted)] underline hover:text-[var(--t-text)] focus:text-[var(--t-accent)] focus:outline-none"
                    >
                      Retry
                    </button>
                  )}
                </div>
              )}
            </form>
          )}

          {/* Wallet addresses */}
          <div className="border-t border-[var(--t-border)] px-4 py-3">
            <div className="flex flex-col gap-2 text-xs">
              <div>
                <span className="text-[var(--t-muted)]">Trader Wallet </span>
                <span className="font-mono text-[var(--t-text)]">
                  {walletAddress ?? "Not derived"}
                </span>
              </div>
              <div>
                <span className="text-[var(--t-muted)]">Owner </span>
                <span className="font-mono text-[var(--t-text)]">
                  {ownerAddress}
                </span>
              </div>
            </div>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
