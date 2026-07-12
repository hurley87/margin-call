"use client";

import { Dialog } from "@base-ui/react/dialog";
import { useTrader } from "@/hooks/use-traders";
import { SeatStakePanel } from "@/components/seat-stake-panel";
import { DIALOG_BACKDROP_CLASS, dialogPopupClass } from "@/lib/utils";

/** Loads the trader's on-chain id, then renders the floor-seat picker. */
function SeatUpgradeContent({
  traderId,
  onClose,
}: {
  traderId: string;
  onClose: () => void;
}) {
  const { data: trader, isLoading, error } = useTrader(traderId);

  return (
    <div className="space-y-3 p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xs uppercase tracking-[0.2em] text-[var(--t-muted)]">
          Upgrade floor seat
          {trader ? (
            <span className="ml-2 text-[var(--t-amber)]">{trader.name}</span>
          ) : null}
        </h2>
        <button
          type="button"
          onClick={onClose}
          className="text-[10px] uppercase tracking-[0.16em] text-[var(--t-muted)] hover:text-[var(--t-text)]"
        >
          Close
        </button>
      </div>

      {isLoading ? (
        <p className="text-xs uppercase tracking-[0.16em] text-[var(--t-muted)]">
          Reading the book…
        </p>
      ) : error || !trader ? (
        <p className="text-xs text-[var(--t-red)]">Trader not found.</p>
      ) : (
        <SeatStakePanel traderId={traderId} onChainTraderId={trader.token_id} />
      )}
    </div>
  );
}

export function SeatUpgradeDialog({
  traderId,
  open,
  onOpenChange,
}: {
  traderId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className={DIALOG_BACKDROP_CLASS} />
        <Dialog.Popup className={dialogPopupClass("lg")}>
          <Dialog.Title className="sr-only">Upgrade floor seat</Dialog.Title>
          <div className="max-h-[calc(100dvh-1rem)] overflow-y-auto sm:max-h-[88vh]">
            {traderId ? (
              <SeatUpgradeContent
                traderId={traderId}
                onClose={() => onOpenChange(false)}
              />
            ) : null}
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
