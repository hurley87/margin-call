"use client";

import { GameButton } from "@/components/ui/game-button";
import { TERMINAL_ACTION_BUTTON_CLASS } from "@/lib/utils";

export type TransactionConfirmRow = {
  label: string;
  value: string;
};

export type TransactionConfirmProps = {
  title: string;
  rows: TransactionConfirmRow[];
  note?: string;
  confirmLabel: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

/**
 * Inline confirm panel for high-stakes sponsored transactions.
 * Renders in place of a form — not as a nested dialog.
 */
export function TransactionConfirm({
  title,
  rows,
  note,
  confirmLabel,
  busy = false,
  onConfirm,
  onCancel,
}: TransactionConfirmProps) {
  return (
    <div className="mt-4" data-testid="transaction-confirm">
      <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--t-accent)]">
        {title}
      </p>
      <dl className="mt-3 space-y-2 text-sm">
        {rows.map((row) => (
          <div key={row.label}>
            <dt className="text-[var(--t-muted)]">{row.label}</dt>
            <dd className="break-all tabular-nums text-[var(--t-text)]">
              {row.value}
            </dd>
          </div>
        ))}
      </dl>
      {note ? (
        <p className="mt-3 text-xs leading-5 text-[var(--t-muted)]">{note}</p>
      ) : null}
      <p className="mt-3 text-xs leading-5 text-[var(--t-green)]">
        Gas sponsored — no ETH required.
      </p>
      <div className="mt-4 flex flex-col gap-3">
        <GameButton
          className="w-full"
          disabled={busy}
          onClick={onConfirm}
          size="sm"
          type="button"
        >
          {busy ? "Submitting…" : confirmLabel}
        </GameButton>
        <button
          className={TERMINAL_ACTION_BUTTON_CLASS}
          disabled={busy}
          onClick={onCancel}
          type="button"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
