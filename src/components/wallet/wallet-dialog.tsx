"use client";

import { Dialog } from "@base-ui/react/dialog";
import { useCallback, useState, type FormEvent } from "react";
import type { Address } from "viem";
import { FlashValue } from "@/components/ui/flash-value";
import { GameButton } from "@/components/ui/game-button";
import { useDeskDollarsTransfer } from "@/hooks/use-desk-dollars-transfer";
import {
  formatDeskDollars,
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
};

/**
 * Signed-in wallet surface: full address utilities and a sponsored tUSD send.
 */
export function WalletDialog({
  open,
  onOpenChange,
  walletAddress,
  balance,
  decimals,
}: WalletDialogProps) {
  const transfer = useDeskDollarsTransfer(walletAddress);
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">(
    "idle"
  );

  const balanceLabel =
    formatDeskDollarsBalanceLabel(balance, decimals) ?? "— tUSD";
  const isBusy =
    transfer.status === "submitting" || transfer.status === "pending";

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
      if (transfer.canRetry) {
        void transfer.retry();
        return;
      }
      void transfer.transfer({ recipient, amount, balance });
    },
    [amount, balance, recipient, transfer]
  );

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
            Base Sepolia only. Desk Dollars (tUSD) have no real value.
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
              onChange={(event) => setRecipient(event.target.value)}
              placeholder="0x…"
              spellCheck={false}
              value={recipient}
            />

            <div className="mt-4 flex items-end justify-between gap-3">
              <label
                className="block text-sm font-bold"
                htmlFor="wallet-transfer-amount"
              >
                Amount (tUSD)
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
              onChange={(event) => setAmount(event.target.value)}
              placeholder="0.000000"
              value={amount}
            />

            {transfer.status === "submitting" ? (
              <p aria-live="polite" className="mt-3 text-sm">
                Submitting your sponsored transfer…
              </p>
            ) : null}
            {transfer.status === "pending" ? (
              <p aria-live="polite" className="mt-3 text-sm">
                Transfer pending until its Base Sepolia receipt succeeds…
              </p>
            ) : null}
            {transfer.status === "confirmed" ? (
              <p aria-live="polite" className="mt-3 text-sm">
                Transfer confirmed on Base Sepolia.
                {transfer.lastHash ? (
                  <>
                    {" "}
                    <a
                      className="underline"
                      href={getBaseSepoliaTransactionUrl(transfer.lastHash)}
                      rel="noreferrer"
                      target="_blank"
                    >
                      View on BaseScan
                    </a>
                  </>
                ) : null}
              </p>
            ) : null}
            {transfer.status === "unavailable" ||
            transfer.status === "error" ? (
              <p role="alert" className="mt-3 text-sm">
                {transfer.error}
              </p>
            ) : null}

            <GameButton
              className="mt-4 w-full"
              disabled={
                transfer.status === "unavailable" ||
                (isBusy
                  ? true
                  : transfer.canRetry
                    ? false
                    : !transfer.canTransfer ||
                      !recipient.trim() ||
                      !amount.trim())
              }
              size="sm"
              type="submit"
            >
              {transfer.canRetry
                ? "Retry"
                : transfer.status === "submitting"
                  ? "Submitting…"
                  : transfer.status === "pending"
                    ? "Pending…"
                    : "Send tUSD"}
            </GameButton>
          </form>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
