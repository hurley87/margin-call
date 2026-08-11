import type { Address } from "viem";
import { requestCrashAttestation } from "./inco-attestation";
import {
  claimRequest,
  computeCrashPointBps,
  deriveTicketOutcome,
  finalizeRequest,
  revealRequest,
  ROUND_STATUS,
  settleLossRequest,
  type CrashCallRequest,
  type CrashRound,
  type CrashTicket,
} from "./margin-call-crash";

export type SettlementStage = "reveal" | "finalize" | "claim" | "settle";

/**
 * The reveal → attest → finalize → claim/settle pipeline shared by the live
 * settlement hook and the personal-history actions. `runStage` submits one
 * receipt-confirmed transaction and throws on failure; `onRoundChange` reports
 * each round-status advance so callers can mirror it into their state.
 */
export async function runVerifyAndSettleFlow(options: {
  contractAddress: Address;
  ticket: CrashTicket;
  round: CrashRound;
  runStage: (
    stage: SettlementStage,
    request: CrashCallRequest
  ) => Promise<void>;
  onAttesting: () => void;
  onRoundChange?: (round: CrashRound) => void;
}): Promise<void> {
  const { contractAddress, ticket, runStage, onAttesting, onRoundChange } =
    options;

  let round = options.round;
  // Locked rounds still store Open until reveal is requested.
  if (round.status === ROUND_STATUS.open) {
    await runStage("reveal", revealRequest(contractAddress, round.id));
    round = { ...round, status: ROUND_STATUS.revealRequested };
    onRoundChange?.(round);
  }

  if (round.status === ROUND_STATUS.revealRequested) {
    onAttesting();
    const attestation = await requestCrashAttestation(round.crashRandom);
    await runStage(
      "finalize",
      finalizeRequest(
        contractAddress,
        round.id,
        attestation.plaintext,
        attestation.signatures
      )
    );
    round = {
      ...round,
      status: ROUND_STATUS.finalized,
      crashPointBps: computeCrashPointBps(attestation.plaintext),
    };
    onRoundChange?.(round);
  }

  const outcome = deriveTicketOutcome(ticket, round);
  if (outcome === "won") {
    await runStage("claim", claimRequest(contractAddress, ticket.id));
  } else if (outcome === "lost") {
    await runStage("settle", settleLossRequest(contractAddress, ticket.id));
  }
}
