"use client";

import { FloorHowToPlay } from "@/components/crash-stage/overlay/floor-how-to-play";
import { CountdownDial } from "@/components/crash-stage/overlay/countdown-dial";
import type { CountdownUrgency } from "@/components/crash-stage/scenes/countdown-scene";
import { TheaterSoundToggle } from "@/components/round-theater/theater-sound-toggle";
import {
  formatDeskDollarsAmount,
  formatDeskDollarsAmountLabel,
} from "@/lib/desk-dollars";
import { formatLeverageBps, type CrashTicket } from "@/lib/margin-call-crash";

const TICKET_CHIP_CLASS =
  "mt-1.5 inline-flex max-w-full flex-wrap items-center gap-x-2 gap-y-1 border border-[var(--t-accent)]/60 bg-[var(--t-bg)]/70 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--t-accent)] backdrop-blur-sm sm:mt-2";

export type StageHudProps = {
  countdownLabel: string | null;
  countdownSeconds: number | null;
  /** 0..1 fill of the active timeline segment for the dial ring. */
  countdownProgress?: number | null;
  urgency?: CountdownUrgency;
  statusMessage: string | null;
  isAlert?: boolean;
  playerTicket: CrashTicket | null;
  suggestSound?: boolean;
  /** When set with clearLabel, the ticket chip becomes the primary resolve CTA. */
  onClear?: () => void;
  clearLabel?: string;
  clearBusy?: boolean;
  /** Current Open entry — chip is informational until the round locks. */
  lockedInOpen?: boolean;
};

/**
 * Compact floor HUD: timer + entry chip on the left, how-to-play + sound right.
 * Faucet lives on CrashRoundEntry in the action overlay.
 */
export function StageHud({
  countdownLabel,
  countdownSeconds,
  countdownProgress = null,
  urgency = "calm",
  statusMessage,
  isAlert = false,
  playerTicket,
  suggestSound = false,
  onClear,
  clearLabel,
  clearBusy = false,
  lockedInOpen = false,
}: StageHudProps) {
  const isClearable = Boolean(playerTicket && onClear && clearLabel);
  const showDial = countdownLabel !== null || countdownSeconds !== null;

  return (
    <div
      className="flex shrink-0 flex-col gap-1.5 px-3 pt-2 sm:gap-2 sm:px-6 sm:pt-3"
      data-testid="stage-hud"
    >
      <div className="flex items-start justify-between gap-2 sm:gap-3">
        <div className="pointer-events-auto flex min-w-0 flex-col items-start">
          {showDial ? (
            <CountdownDial
              label={countdownLabel}
              locked={urgency === "locked"}
              progress={countdownProgress}
              seconds={countdownSeconds}
              urgency={urgency}
            />
          ) : null}
          {playerTicket ? (
            isClearable ? (
              <button
                aria-label={clearLabel}
                className={`${TICKET_CHIP_CLASS} cursor-pointer disabled:cursor-not-allowed disabled:opacity-60`}
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
                className={`${TICKET_CHIP_CLASS} cursor-default`}
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
        </div>

        <div className="pointer-events-auto flex shrink-0 items-center gap-2">
          <FloorHowToPlay />
          <TheaterSoundToggle suggest={suggestSound} />
        </div>
      </div>

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
