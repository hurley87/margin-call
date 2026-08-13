/**
 * Player-local settle ceremony: the client-owned state machine that takes
 * over the Floor from the moment the player clicks Verify and settle until
 * they acknowledge the result.
 *
 * Polled chain state cannot drive this reveal — the theater, ticket, and
 * settlement reads each lag up to 10s, so the settling player routinely used
 * to miss their own climb. The ceremony freezes a snapshot at click time,
 * reveals from the locally computed Crash Point, and holds the landed result
 * until an explicit acknowledge. Settlement errors do NOT transition the
 * ceremony: retry renders inside whatever phase is active, so a failed
 * background transaction can never destroy a held result.
 */

import {
  computeTicketPayout,
  isWinningTicket,
  type CrashTicket,
  type RoundTicketTape,
  type TierExposure,
} from "@/lib/margin-call-crash";

/** Data frozen at click time so poll churn cannot mutate the ceremony. */
export type CeremonySnapshot = {
  roundId: bigint;
  ticket: CrashTicket;
  tape: RoundTicketTape | null;
  tiers: TierExposure[];
};

/** Locally computed result, available before the settle receipts land. */
export type CeremonyReveal = {
  crashPointBps: bigint;
  outcome: "won" | "lost";
  payout: bigint;
};

export type SettleCeremonyPhase = SettleCeremony["phase"];

export type SettleCeremony =
  | { phase: "idle" }
  | { phase: "verifying"; snapshot: CeremonySnapshot }
  | {
      phase: "climbing";
      snapshot: CeremonySnapshot;
      reveal: CeremonyReveal;
      /** Bump restarts the climb; feeds the replay clock's restartNonce. */
      startNonce: number;
    }
  | {
      phase: "landed";
      snapshot: CeremonySnapshot;
      reveal: CeremonyReveal;
      startNonce: number;
    };

export type CeremonyEvent =
  | { type: "start"; snapshot: CeremonySnapshot }
  | {
      type: "crash-point-known";
      crashPointBps: bigint;
      /** Reduced motion skips the climb and lands immediately. */
      reducedMotion: boolean;
    }
  | { type: "climb-complete" }
  | { type: "rewatch" }
  | { type: "acknowledge" }
  | { type: "reset" };

export const IDLE_CEREMONY: SettleCeremony = { phase: "idle" };

/**
 * Pure transition function. Out-of-phase events are ignored rather than
 * thrown so racing pollers and duplicate callbacks are harmless:
 *
 *   idle → verifying → climbing → landed → idle
 *                 (reduced motion skips climbing)
 *
 * `acknowledge` is the only exit from `landed` — the live round never
 * reclaims the stage on a timer.
 */
export function advanceCeremony(
  state: SettleCeremony,
  event: CeremonyEvent
): SettleCeremony {
  switch (event.type) {
    case "start":
      return state.phase === "idle"
        ? { phase: "verifying", snapshot: event.snapshot }
        : state;
    case "crash-point-known": {
      if (state.phase !== "verifying") return state;
      const reveal = buildCeremonyReveal(
        state.snapshot.ticket,
        event.crashPointBps
      );
      return {
        phase: event.reducedMotion ? "landed" : "climbing",
        snapshot: state.snapshot,
        reveal,
        startNonce: 0,
      };
    }
    case "climb-complete":
      return state.phase === "climbing" ? { ...state, phase: "landed" } : state;
    case "rewatch":
      return state.phase === "landed"
        ? { ...state, phase: "climbing", startNonce: state.startNonce + 1 }
        : state;
    case "acknowledge":
      return state.phase === "landed" ? IDLE_CEREMONY : state;
    case "reset":
      return IDLE_CEREMONY;
    default: {
      const _exhaustive: never = event;
      return _exhaustive;
    }
  }
}

/** Outcome and payout are pure functions of the frozen ticket + Crash Point. */
export function buildCeremonyReveal(
  ticket: CrashTicket,
  crashPointBps: bigint
): CeremonyReveal {
  return {
    crashPointBps,
    outcome: isWinningTicket(ticket.leverageBps, crashPointBps)
      ? "won"
      : "lost",
    payout: computeTicketPayout(
      ticket.margin,
      ticket.leverageBps,
      crashPointBps
    ),
  };
}
