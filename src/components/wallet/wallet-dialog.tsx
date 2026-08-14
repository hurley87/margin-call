"use client";

import { Dialog } from "@base-ui/react/dialog";
import { useCallback, useState, type FormEvent } from "react";
import type { Address } from "viem";
import { DeskPhoneSwitch } from "@/components/auth/desk-phone-switch";
import { DeskDollarsFaucet } from "@/components/desk-dollars/desk-dollars-faucet";
import { FlashValue } from "@/components/ui/flash-value";
import { GameButton } from "@/components/ui/game-button";
import { TransactionConfirm } from "@/components/ui/transaction-confirm";
import {
  useDeskDollarsTransfer,
  validateDeskDollarsTransfer,
} from "@/hooks/use-desk-dollars-transfer";
import type { DeskDollarsTransferStatus } from "@/hooks/use-desk-dollars-transfer";
import { usePendingConfirm } from "@/hooks/use-pending-confirm";
import {
  DISPLAY_ASSET_SYMBOL,
  formatDeskDollars,
  formatDeskDollarsAmount,
  formatDeskDollarsAmountLabel,
  formatDeskDollarsBalanceLabel,
  TUSD_DECIMALS,
} from "@/lib/desk-dollars";
import {
  getBaseSepoliaAddressUrl,
  getBaseSepoliaTransactionUrl,
} from "@/lib/base-sepolia-explorer";
import {
  DIALOG_BACKDROP_CLASS,
  dialogPopupClass,
  TERMINAL_ACTION_BUTTON_CLASS,
} from "@/lib/utils";

type WalletDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  walletAddress: Address;
  balance: bigint | null;
  decimals: number | null;
  onLogout: () => void | Promise<void>;
};

type TransferStatusMessage = {
  status: DeskDollarsTransferStatus;
  error: string | null;
  lastHash: `0x${string}` | null;
};

type PendingTransfer = {
  to: Address;
  amountWei: bigint;
};

function TransferStatusCopy({
  status,
  error,
  lastHash,
}: TransferStatusMessage) {
  switch (status) {
    case "submitting":
      return (
        <p aria-live="polite" className="mt-3 text-sm">
          Submitting your sponsored transfer…
        </p>
      );
    case "pending":
      return (
        <p aria-live="polite" className="mt-3 text-sm">
          Transfer pending until its Base Sepolia receipt succeeds…
        </p>
      );
    case "confirmed":
      return (
        <p aria-live="polite" className="mt-3 text-sm">
          Transfer confirmed on Base Sepolia.
          {lastHash ? (
            <>
              {" "}
              <a
                className="underline"
                href={getBaseSepoliaTransactionUrl(lastHash)}
                rel="noreferrer"
                target="_blank"
              >
                View on BaseScan
              </a>
            </>
          ) : null}
        </p>
      );
    case "unavailable":
    case "error":
      return error ? (
        <p role="alert" className="mt-3 text-sm">
          {error}
        </p>
      ) : null;
    case "idle":
      return null;
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}

/**
 * Signed-in wallet surface: full address utilities and a sponsored USDC send.
 */
export function WalletDialog({
  open,
  onOpenChange,
  walletAddress,
  balance,
  decimals,
  onLogout,
}: WalletDialogProps) {
  const transfer = useDeskDollarsTransfer(walletAddress);
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);
  const pendingTransfer = usePendingConfirm<PendingTransfer>();
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">(
    "idle"
  );

  const balanceLabel =
    formatDeskDollarsBalanceLabel(balance, decimals) ??
    formatDeskDollarsAmountLabel(null);
  const isBusy =
    transfer.status === "submitting" || transfer.status === "pending";
  const isRetry = transfer.canRetry;
  const canSubmit =
    transfer.status !== "unavailable" &&
    !isBusy &&
    (isRetry ||
      (transfer.canTransfer && !!recipient.trim() && !!amount.trim()));
  const submitLabel = isBusy
    ? transfer.status === "submitting"
      ? "Submitting…"
      : "Pending…"
    : isRetry
      ? "Retry"
      : `Send ${DISPLAY_ASSET_SYMBOL}`;

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(walletAddress);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
  }, [walletAddress]);

  const handleMax = useCallback(() => {
    if (balance === null) return;
    setAmount(formatDeskDollars(balance, decimals ?? TUSD_DECIMALS));
  }, [balance, decimals]);

  const handleSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (isRetry) {
        void transfer.retry();
        return;
      }
      const validation = validateDeskDollarsTransfer({
        recipient,
        amount,
        balance,
        from: walletAddress,
      });
      if (!validation.ok) {
        setValidationError(validation.error);
        pendingTransfer.cancel();
        return;
      }
      setValidationError(null);
      pendingTransfer.arm({
        to: validation.to,
        amountWei: validation.amount,
      });
    },
    [
      amount,
      balance,
      isRetry,
      pendingTransfer,
      recipient,
      transfer,
      walletAddress,
    ]
  );

  const handleConfirmTransfer = useCallback(() => {
    pendingTransfer.confirm((armed) =>
      transfer.transferValidated({
        to: armed.to,
        amount: armed.amountWei,
      })
    );
  }, [pendingTransfer, transfer]);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className={DIALOG_BACKDROP_CLASS} />
        <Dialog.Popup
          className={`${dialogPopupClass("sm")} overflow-y-auto p-5`}
          data-testid="wallet-dialog"
        >
          <div className="flex items-start justify-between gap-3">
            <Dialog.Title className="font-[family-name:var(--font-plex-sans)] text-lg font-bold uppercase tracking-wide text-[var(--t-accent)]">
              Wallet
            </Dialog.Title>
            <Dialog.Close
              aria-label="Close wallet"
              className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--t-muted)] hover:text-[var(--t-text)]"
            >
              Close
            </Dialog.Close>
          </div>

          <Dialog.Description className="mt-2 text-xs text-[var(--t-muted)]">
            Base Sepolia only. Desk Dollars ({DISPLAY_ASSET_SYMBOL}) have no
            real value.
          </Dialog.Description>

          <div className="mt-5 space-y-2">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--t-muted)]">
              Address
            </p>
            <p
              className="break-all text-sm text-[var(--t-text)]"
              data-testid="wallet-dialog-address"
            >
              {walletAddress}
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                className={TERMINAL_ACTION_BUTTON_CLASS}
                onClick={() => void handleCopy()}
                type="button"
              >
                {copyState === "copied"
                  ? "Copied"
                  : copyState === "failed"
                    ? "Copy failed"
                    : "Copy"}
              </button>
              <a
                className={TERMINAL_ACTION_BUTTON_CLASS}
                href={getBaseSepoliaAddressUrl(walletAddress)}
                rel="noreferrer"
                target="_blank"
              >
                BaseScan
              </a>
            </div>
          </div>

          <p className="mt-5 text-sm text-[var(--t-text)]">
            Balance:{" "}
            {balance !== null ? (
              <FlashValue className="text-[var(--t-green-hot)]" value={balance}>
                {balanceLabel}
              </FlashValue>
            ) : (
              balanceLabel
            )}
          </p>

          <div className="mt-4 flex justify-start">
            <DeskPhoneSwitch walletAddress={walletAddress} />
          </div>

          <DeskDollarsFaucet />

          {pendingTransfer.pending ? (
            <div className="mt-6 border-t border-[var(--t-border)] pt-5">
              <TransactionConfirm
                busy={isBusy}
                confirmLabel={`Confirm send ${DISPLAY_ASSET_SYMBOL}`}
                note="Desk Dollars have no real value. Double-check the recipient before sending."
                onCancel={pendingTransfer.cancel}
                onConfirm={handleConfirmTransfer}
                rows={[
                  { label: "Recipient", value: pendingTransfer.pending.to },
                  {
                    label: "Amount",
                    value: formatDeskDollarsAmount(
                      pendingTransfer.pending.amountWei
                    ),
                  },
                ]}
                title="Confirm transfer"
              />
              <TransferStatusCopy
                error={transfer.error}
                lastHash={transfer.lastHash}
                status={transfer.status}
              />
            </div>
          ) : (
            <form
              className="mt-6 border-t border-[var(--t-border)] pt-5"
              onSubmit={handleSubmit}
            >
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--t-muted)]">
                Transfer Desk Dollars
              </p>

              <label
                className="mt-4 block text-sm font-bold"
                htmlFor="wallet-transfer-recipient"
              >
                Recipient
              </label>
              <input
                autoComplete="off"
                className="mt-2 w-full border border-[var(--t-muted)] bg-transparent px-3 py-2 text-[var(--t-text)]"
                disabled={isBusy}
                id="wallet-transfer-recipient"
                onChange={(event) => {
                  setRecipient(event.target.value);
                  setValidationError(null);
                }}
                placeholder="0x…"
                spellCheck={false}
                value={recipient}
              />

              <div className="mt-4 flex items-end justify-between gap-3">
                <label
                  className="block text-sm font-bold"
                  htmlFor="wallet-transfer-amount"
                >
                  Amount ({DISPLAY_ASSET_SYMBOL})
                </label>
                <button
                  className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--t-accent)] disabled:opacity-50"
                  disabled={isBusy || balance === null || balance <= 0n}
                  onClick={handleMax}
                  type="button"
                >
                  Max
                </button>
              </div>
              <input
                className="mt-2 w-full border border-[var(--t-muted)] bg-transparent px-3 py-2 text-[var(--t-text)]"
                disabled={isBusy}
                id="wallet-transfer-amount"
                inputMode="decimal"
                onChange={(event) => {
                  setAmount(event.target.value);
                  setValidationError(null);
                }}
                placeholder="0.000000"
                value={amount}
              />

              {validationError ? (
                <p role="alert" className="mt-3 text-sm">
                  {validationError}
                </p>
              ) : null}

              <TransferStatusCopy
                error={transfer.error}
                lastHash={transfer.lastHash}
                status={transfer.status}
              />

              <GameButton
                className="mt-4 w-full"
                disabled={!canSubmit}
                size="sm"
                type="submit"
              >
                {submitLabel}
              </GameButton>
            </form>
          )}

          <div className="mt-6 border-t border-[var(--t-border)] pt-5">
            <button
              className="w-full rounded-sm border border-[var(--t-muted)] px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wide text-[var(--t-text)] hover:border-[var(--t-accent)] hover:text-[var(--t-accent)] sm:text-xs"
              data-testid="wallet-dialog-logout"
              onClick={() => void onLogout()}
              type="button"
            >
              Log out
            </button>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
