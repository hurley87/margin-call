"use client";

import { useState } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { parseUnits } from "viem";
import { useDepositFlow, useWithdrawFlow } from "@/hooks/use-escrow";

const ZERO = BigInt(0);

/** USDC micros for inputs + Max; avoids float noise and matches `parseUnits(_, 6)`. */
function usdcToInputString(usdc: number): string {
  const micros = Math.round(usdc * 1_000_000);
  return (micros / 1_000_000).toFixed(6).replace(/\.?0+$/, "") || "0";
}

interface WalletDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  traderId: number;
  /** Supabase UUID for the trader (used to record transactions) */
  supabaseId?: string;
  walletUsdc: number | undefined;
  escrowUsdc: number | null;
  tbaAddress: string | null;
  ownerAddress: string;
  isNewTrader: boolean;
  onSuccess: () => void;
}

export function WalletDialog({
  open,
  onOpenChange,
  traderId,
  supabaseId,
  walletUsdc,
  escrowUsdc,
  tbaAddress,
  ownerAddress,
  isNewTrader,
  onSuccess,
}: WalletDialogProps) {
  const [mode, setMode] = useState<"deposit" | "withdraw">("deposit");
  const [amount, setAmount] = useState("");

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
  }

  async function handleDeposit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = parseUnits(amount, 6);
    if (parsed === ZERO) return;

    try {
      await deposit(BigInt(traderId), parsed, supabaseId);
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

    try {
      await withdraw(BigInt(traderId), parsed, supabaseId);
      setAmount("");
      onSuccess();
    } catch {
      // error surfaced via hook state
    }
  }

  const showWelcome = isNewTrader && (escrowUsdc === null || escrowUsdc === 0);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/70" />
        <Dialog.Popup className="fixed left-1/2 top-1/2 z-50 w-[90vw] max-w-md -translate-x-1/2 -translate-y-1/2 border border-[var(--t-border)] bg-[var(--t-bg)] font-mono">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-[var(--t-border)] bg-[var(--t-surface)] px-4 py-2">
            <span className="text-[10px] uppercase tracking-wider text-[var(--t-muted)]">
              WALLET
            </span>
            <Dialog.Close className="text-[10px] text-[var(--t-muted)] transition-colors hover:text-[var(--t-text)]">
              [X]
            </Dialog.Close>
          </div>

          {/* Balance display */}
          <div className="border-b border-[var(--t-border)] px-4 py-4 text-center">
            <p className="text-[10px] uppercase tracking-wider text-[var(--t-muted)]">
              TRADER BALANCE
            </p>
            <p className="mt-1 text-2xl font-semibold text-[var(--t-text)]">
              ${escrowUsdc !== null ? escrowUsdc.toFixed(2) : "..."}
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
          {mode === "deposit" && (
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
                  className="w-full border border-[var(--t-border)] bg-[var(--t-bg)] px-3 py-2 text-sm text-[var(--t-text)] placeholder-[var(--t-muted)] focus:border-[var(--t-accent)] focus:outline-none disabled:opacity-50"
                />
                {walletUsdc !== undefined && walletUsdc > 0 && (
                  <button
                    type="button"
                    onClick={() => setAmount(usdcToInputString(walletUsdc))}
                    className="shrink-0 text-xs text-[var(--t-accent)] hover:underline"
                  >
                    Max
                  </button>
                )}
              </div>
              <button
                type="submit"
                disabled={isDepositBusy || !amount}
                className="border border-[var(--t-accent)] bg-[var(--t-surface)] px-4 py-2 text-sm font-medium text-[var(--t-accent)] transition-colors hover:bg-[var(--t-accent)] hover:text-[var(--t-bg)] disabled:opacity-50"
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
              {depositError && (
                <div className="flex items-center gap-2">
                  <p className="text-xs text-[var(--t-red)]">
                    {depositError.slice(0, 120)}
                  </p>
                  <button
                    type="button"
                    onClick={resetDeposit}
                    className="text-xs text-[var(--t-muted)] underline hover:text-[var(--t-text)]"
                  >
                    Retry
                  </button>
                </div>
              )}
            </form>
          )}

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
                  className="w-full border border-[var(--t-border)] bg-[var(--t-bg)] px-3 py-2 text-sm text-[var(--t-text)] placeholder-[var(--t-muted)] focus:border-[var(--t-accent)] focus:outline-none disabled:opacity-50"
                />
                {escrowUsdc !== null && escrowUsdc > 0 && (
                  <button
                    type="button"
                    onClick={() => setAmount(usdcToInputString(escrowUsdc))}
                    className="shrink-0 text-xs text-[var(--t-accent)] hover:underline"
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
                className="border border-[var(--t-accent)] bg-[var(--t-surface)] px-4 py-2 text-sm font-medium text-[var(--t-accent)] transition-colors hover:bg-[var(--t-accent)] hover:text-[var(--t-bg)] disabled:opacity-50"
              >
                {withdrawBusy ? "Withdrawing..." : "Withdraw"}
              </button>
              {withdrawDone && (
                <p className="text-xs text-[var(--t-green)]">
                  Withdrawal confirmed.
                </p>
              )}
              {withdrawError && (
                <div className="flex items-center gap-2">
                  <p className="text-xs text-[var(--t-red)]">
                    {withdrawError.slice(0, 120)}
                  </p>
                  <button
                    type="button"
                    onClick={resetWithdraw}
                    className="text-xs text-[var(--t-muted)] underline hover:text-[var(--t-text)]"
                  >
                    Retry
                  </button>
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
                  {tbaAddress ?? "Not derived"}
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
