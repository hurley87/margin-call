"use client";

import { TheaterSoundToggle } from "@/components/round-theater/theater-sound-toggle";
import {
  formatDeskDollarsAmount,
  formatDeskDollarsAmountLabel,
} from "@/lib/desk-dollars";
import { formatLeverageBps, type CrashTicket } from "@/lib/margin-call-crash";
import { formatCountdown } from "@/lib/utils";

export type StageHudProps = {
  countdownLabel: string | null;
  countdownSeconds: number | null;
  statusMessage: string | null;
  isAlert?: boolean;
  playerTicket: CrashTicket | null;
  suggestSound?: boolean;
};

/**
 * Compact floor HUD: live region, YOU ticket chip, sound.
 * Faucet lives on CrashRoundEntry in the action overlay.
 */
export function StageHud({
  countdownLabel,
  countdownSeconds,
  statusMessage,
  isAlert = false,
  playerTicket,
  suggestSound = false,
}: StageHudProps) {
  return (
    <div
      className="flex shrink-0 flex-col gap-2 px-4 sm:px-6"
      data-testid="stage-hud"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="pointer-events-auto">
          {countdownLabel && countdownSeconds !== null ? (
            <p
              aria-live="polite"
              className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--t-muted)]"
            >
              {countdownLabel}{" "}
              <span className="tabular-nums text-[var(--t-text)]">
                {formatCountdown(countdownSeconds)}
              </span>
            </p>
          ) : null}
          {playerTicket ? (
            <p
              className="mt-2 inline-flex items-center gap-2 border border-[var(--t-accent)]/60 bg-[var(--t-bg)]/70 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--t-accent)] backdrop-blur-sm"
              data-testid="stage-player-ticket"
            >
              <span
                aria-hidden="true"
                className="live-pulse h-1.5 w-1.5 bg-[var(--t-accent)]"
              />
              Your Ticket · {formatDeskDollarsAmount(playerTicket.margin)} ·{" "}
              {formatLeverageBps(playerTicket.leverageBps)}
              {playerTicket.reservedPayout > 0n ? (
                <span className="text-[var(--t-muted)]">
                  · max{" "}
                  {formatDeskDollarsAmountLabel(playerTicket.reservedPayout)}
                </span>
              ) : null}
            </p>
          ) : null}
        </div>
        <div className="pointer-events-auto">
          <TheaterSoundToggle suggest={suggestSound} />
        </div>
      </div>

      {statusMessage ? (
        <p
          aria-live={isAlert ? undefined : "polite"}
          className={`pointer-events-auto max-w-xl text-xs leading-5 ${
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
