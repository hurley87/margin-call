"use client";

import {
  formatDeskDollarsAmount,
  formatDeskDollarsAmountLabel,
} from "@/lib/desk-dollars";
import { formatLeverageBps, type CrashTicket } from "@/lib/margin-call-crash";

const TICKET_CHIP_CLASS =
  "inline-flex max-w-full flex-wrap items-center gap-x-2 gap-y-1 border border-[var(--t-accent)]/60 bg-[var(--t-bg)]/70 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--t-accent)] backdrop-blur-sm";

export type StageHudProps = {
  statusMessage: string | null;
  isAlert?: boolean;
  playerTicket: CrashTicket | null;
  /** When set with clearLabel, the ticket chip becomes the primary resolve CTA. */
  onClear?: () => void;
  clearLabel?: string;
  clearBusy?: boolean;
  /** Current Open entry — chip is informational until the round locks. */
  lockedInOpen?: boolean;
};

/**
 * Compact floor HUD: entry ticket chip and optional status message.
 * Countdown lives in CountdownBanner; how-to-play and sound live in the header /
 * wallet dialog.
 */
export function StageHud({
  statusMessage,
  isAlert = false,
  playerTicket,
  onClear,
  clearLabel,
  clearBusy = false,
  lockedInOpen = false,
}: StageHudProps) {
  const isClearable = Boolean(playerTicket && onClear && clearLabel);

  if (!playerTicket && !statusMessage) return null;

  return (
    <div
      className="flex shrink-0 flex-col gap-1.5 px-3 pt-2 sm:gap-2 sm:px-6 sm:pt-3"
      data-testid="stage-hud"
    >
      {playerTicket ? (
        isClearable ? (
          <button
            aria-label={clearLabel}
            className={`${TICKET_CHIP_CLASS} pointer-events-auto cursor-pointer disabled:cursor-not-allowed disabled:opacity-60`}
            data-testid="stage-player-ticket"
            disabled={clearBusy}
            onClick={onClear}
            title={clearLabel}
            type="button"
          >
            <TicketChipBody ticket={playerTicket} />
          </button>
        ) : (
          <p
            className={`${TICKET_CHIP_CLASS} pointer-events-auto cursor-default`}
            data-testid="stage-player-ticket"
            title={
              lockedInOpen
                ? "Locked in until entry closes — settle after the round locks"
                : undefined
            }
          >
            <TicketChipBody ticket={playerTicket} />
          </p>
        )
      ) : null}

      {statusMessage ? (
        <p
          aria-live={isAlert ? undefined : "polite"}
          className={`pointer-events-auto line-clamp-3 max-w-xl text-xs leading-5 sm:line-clamp-none ${
            isAlert ? "text-[var(--t-red)]" : "text-[var(--t-muted)]"
          }`}
          role={isAlert ? "alert" : undefined}
        >
          {statusMessage}
        </p>
      ) : null}
    </div>
  );
}

function TicketChipBody({ ticket }: { ticket: CrashTicket }) {
  return (
    <>
      <span
        aria-hidden="true"
        className="live-pulse h-1.5 w-1.5 shrink-0 bg-[var(--t-accent)]"
      />
      <span className="min-w-0">
        Your Ticket · {formatDeskDollarsAmount(ticket.margin)} ·{" "}
        {formatLeverageBps(ticket.leverageBps)}
        {ticket.reservedPayout > 0n ? (
          <span className="text-[var(--t-muted)]">
            · max {formatDeskDollarsAmountLabel(ticket.reservedPayout)}
          </span>
        ) : null}
      </span>
    </>
  );
}
