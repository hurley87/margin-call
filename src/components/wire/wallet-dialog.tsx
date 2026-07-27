"use client";

import { Dialog } from "@base-ui/react/dialog";
import { WalletProvisioningError } from "@/components/wallet-provisioning-error";
import { NetworkBadge } from "@/components/shared/network-badge";
import { DIALOG_BACKDROP_CLASS, formatUsdc } from "@/lib/utils";
import { AnimatedNumber } from "@/components/animated-number";
import type { Doc, Id } from "../../../convex/_generated/dataModel";

interface WalletDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  convexTraderId: string;
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

/**
 * Read-only wallet dialog — deposit/withdraw/ensure-depositor removed with
 * the escrow client teardown.
 */
export function WalletDialog({
  open,
  onOpenChange,
  convexTraderId,
  walletUsdc,
  escrowUsdc,
  walletAddress,
  walletStatus,
  walletError,
}: WalletDialogProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className={DIALOG_BACKDROP_CLASS} />
        <Dialog.Popup className="fixed left-1/2 top-1/2 z-50 w-[92vw] max-w-md -translate-x-1/2 -translate-y-1/2 border border-[var(--t-border)] bg-[var(--t-bg)] font-mono shadow-2xl shadow-black/60">
          <Dialog.Title className="sr-only">Trader wallet</Dialog.Title>
          <div className="flex items-center justify-between border-b border-[var(--t-divider)] px-4 py-3">
            <div>
              <h2 className="text-sm font-black uppercase tracking-[0.14em] text-[var(--t-accent)]">
                Trader wallet
              </h2>
              <NetworkBadge className="mt-1" />
            </div>
            <Dialog.Close className="text-xs uppercase tracking-[0.16em] text-[var(--t-muted)] hover:text-[var(--t-text)]">
              Close
            </Dialog.Close>
          </div>

          <div className="space-y-4 px-4 py-4 text-xs">
            {walletStatus !== "ready" ? (
              <WalletProvisioningError
                traderId={convexTraderId as Id<"traders">}
                walletError={walletError}
              />
            ) : null}

            <div className="grid grid-cols-2 gap-px border border-[var(--t-divider)] bg-[var(--t-divider)]">
              <div className="bg-[var(--t-bg)] px-3 py-2">
                <p className="text-[10px] uppercase tracking-[0.16em] text-[var(--t-muted)]">
                  Desk cash
                </p>
                <p className="mt-1 text-[var(--t-green)]">
                  {walletUsdc === undefined ? (
                    "—"
                  ) : (
                    <AnimatedNumber value={walletUsdc} format={formatUsdc} />
                  )}
                </p>
              </div>
              <div className="bg-[var(--t-bg)] px-3 py-2">
                <p className="text-[10px] uppercase tracking-[0.16em] text-[var(--t-muted)]">
                  Escrow
                </p>
                <p className="mt-1 text-[var(--t-text)]">
                  {escrowUsdc === null ? (
                    "—"
                  ) : (
                    <AnimatedNumber value={escrowUsdc} format={formatUsdc} />
                  )}
                </p>
              </div>
            </div>

            {walletAddress ? (
              <p className="break-all text-[10px] uppercase tracking-[0.12em] text-[var(--t-muted)]">
                {walletAddress}
              </p>
            ) : null}

            <p className="uppercase tracking-[0.14em] text-[var(--t-amber)]">
              Deposit / withdraw is temporarily unavailable.
            </p>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
