import type { Address } from "viem";
import { requestCrashAttestation } from "./inco-attestation";
import {
  claimRequest,
  computeCrashPointBps,
  deriveTicketOutcome,
  finalizeRequest,
  readCrashRound,
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
 *
 * `onCrashPointKnown` fires at the earliest moment the Crash Point is
 * determined client-side: immediately for an already-finalized round, or as
 * soon as the covalidator attestation returns — before the finalize receipt.
 * The crash point is a pure function of the attested plaintext, so a
 * presentation layer may reveal the outcome while finalize/claim confirm in
 * the background.
 *
 * A keeper may finalize between attestation and our finalize submit. When that
 * happens we adopt the onchain finalized round and continue to claim/settle
 * instead of treating the finalize revert as a hard failure.
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
  onCrashPointKnown?: (crashPointBps: bigint) => void;
}): Promise<void> {
  const {
    contractAddress,
    ticket,
    runStage,
    onAttesting,
    onRoundChange,
    onCrashPointKnown,
  } = options;

  let round = options.round;
  if (round.status === ROUND_STATUS.finalized) {
    onCrashPointKnown?.(round.crashPointBps);
  }

  // Locked rounds still store Open until reveal is requested.
  if (round.status === ROUND_STATUS.open) {
    await runStage("reveal", revealRequest(contractAddress, round.id));
    round = { ...round, status: ROUND_STATUS.revealRequested };
    onRoundChange?.(round);
  }

  if (round.status === ROUND_STATUS.revealRequested) {
    onAttesting();
    const attestation = await requestCrashAttestation(round.crashRandom);
    const crashPointBps = computeCrashPointBps(attestation.plaintext);
    onCrashPointKnown?.(crashPointBps);

    const alreadyFinalized = await adoptFinalizedRoundIfPresent(
      contractAddress,
      round.id
    );
    if (alreadyFinalized) {
      round = alreadyFinalized;
      onRoundChange?.(round);
    } else {
      try {
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
          crashPointBps,
        };
        onRoundChange?.(round);
      } catch (error) {
        // Keeper may have finalized between our pre-check and submit.
        const raced = await adoptFinalizedRoundIfPresent(
          contractAddress,
          round.id
        );
        if (!raced) throw error;
        round = raced;
        onRoundChange?.(round);
      }
    }
  }

  const outcome = deriveTicketOutcome(ticket, round);
  if (outcome === "won") {
    await runStage("claim", claimRequest(contractAddress, ticket.id));
  } else if (outcome === "lost") {
    await runStage("settle", settleLossRequest(contractAddress, ticket.id));
  }
}

async function adoptFinalizedRoundIfPresent(
  contractAddress: Address,
  roundId: bigint
): Promise<CrashRound | null> {
  const latest = await readCrashRound(contractAddress, roundId);
  return latest.status === ROUND_STATUS.finalized ? latest : null;
}
