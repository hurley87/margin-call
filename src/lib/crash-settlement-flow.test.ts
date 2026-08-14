import { beforeEach, describe, expect, it, vi } from "vitest";

const attestation = vi.hoisted(() => ({
  requestCrashAttestation: vi.fn(),
}));

const crashReads = vi.hoisted(() => ({
  readCrashRound: vi.fn(),
}));

vi.mock("./inco-attestation", () => ({
  requestCrashAttestation: (...args: unknown[]) =>
    attestation.requestCrashAttestation(...args),
}));

vi.mock("./margin-call-crash", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./margin-call-crash")>();
  return {
    ...actual,
    readCrashRound: (...args: unknown[]) => crashReads.readCrashRound(...args),
  };
});

import {
  runVerifyAndSettleFlow,
  type SettlementStage,
} from "./crash-settlement-flow";
import {
  computeCrashPointBps,
  ROUND_STATUS,
  type CrashRound,
  type CrashTicket,
} from "./margin-call-crash";

const contractAddress = "0x0000000000000000000000000000000000000001" as const;

const ticket: CrashTicket = {
  id: 7n,
  player: "0x0000000000000000000000000000000000000003",
  roundId: 12n,
  margin: 5_000_000n,
  leverageBps: 20_000n,
  reservedPayout: 10_000_000n,
  settled: false,
  claimed: false,
};

const baseRound: CrashRound = {
  id: 12n,
  openAt: 1_000n,
  lockAt: 1_045n,
  expiresAt: 1_945n,
  crashRandom:
    "0x000000000000000000000000000000000000000000000000000000000000cafe",
  crashPointBps: 0n,
  totalMargin: 5_000_000n,
  reservedPayout: 10_000_000n,
  status: ROUND_STATUS.open,
};

// 99_000_000 / (10_000 - 5_050) = 20_000 bps — exactly the ticket tier, a win.
const WINNING_PLAINTEXT = 5_050n;

function makeRecorder() {
  const events: string[] = [];
  const runStage = vi.fn(async (stage: SettlementStage): Promise<void> => {
    events.push(`stage:${stage}`);
  });
  const onCrashPointKnown = vi.fn((crashPointBps: bigint) => {
    events.push(`crash-point:${crashPointBps}`);
  });
  return { events, runStage, onCrashPointKnown };
}

function openRoundRead(): CrashRound {
  return {
    ...baseRound,
    status: ROUND_STATUS.revealRequested,
  };
}

function finalizedRoundRead(crashPointBps: bigint): CrashRound {
  return {
    ...baseRound,
    status: ROUND_STATUS.finalized,
    crashPointBps,
  };
}

describe("runVerifyAndSettleFlow onCrashPointKnown", () => {
  beforeEach(() => {
    attestation.requestCrashAttestation.mockReset();
    crashReads.readCrashRound.mockReset();
    crashReads.readCrashRound.mockResolvedValue(openRoundRead());
  });

  it("fires after attestation and before the finalize stage", async () => {
    attestation.requestCrashAttestation.mockResolvedValue({
      plaintext: WINNING_PLAINTEXT,
      signatures: ["0x01"],
    });
    const { events, runStage, onCrashPointKnown } = makeRecorder();

    await runVerifyAndSettleFlow({
      contractAddress,
      ticket,
      round: baseRound,
      runStage,
      onAttesting: () => events.push("attesting"),
      onCrashPointKnown,
    });

    const expected = computeCrashPointBps(WINNING_PLAINTEXT);
    expect(onCrashPointKnown).toHaveBeenCalledTimes(1);
    expect(onCrashPointKnown).toHaveBeenCalledWith(expected);
    expect(events).toEqual([
      "stage:reveal",
      "attesting",
      `crash-point:${expected}`,
      "stage:finalize",
      "stage:claim",
    ]);
  });

  it("fires immediately for an already-finalized round without attesting", async () => {
    const { events, runStage, onCrashPointKnown } = makeRecorder();

    await runVerifyAndSettleFlow({
      contractAddress,
      ticket,
      round: {
        ...baseRound,
        status: ROUND_STATUS.finalized,
        crashPointBps: 34_200n,
      },
      runStage,
      onAttesting: () => events.push("attesting"),
      onCrashPointKnown,
    });

    expect(onCrashPointKnown).toHaveBeenCalledWith(34_200n);
    expect(attestation.requestCrashAttestation).not.toHaveBeenCalled();
    expect(crashReads.readCrashRound).not.toHaveBeenCalled();
    expect(events).toEqual(["crash-point:34200", "stage:claim"]);
  });

  it("routes a losing ticket to the settle stage after the reveal", async () => {
    // 99_000_000 / (10_000 - 1_000) = 11_000 bps — below the 2.00x tier.
    attestation.requestCrashAttestation.mockResolvedValue({
      plaintext: 1_000n,
      signatures: ["0x01"],
    });
    const { events, runStage, onCrashPointKnown } = makeRecorder();

    await runVerifyAndSettleFlow({
      contractAddress,
      ticket,
      round: baseRound,
      runStage,
      onAttesting: () => events.push("attesting"),
      onCrashPointKnown,
    });

    expect(events.at(-1)).toBe("stage:settle");
  });

  it("never fires when attestation fails", async () => {
    attestation.requestCrashAttestation.mockRejectedValue(
      new Error("covalidators unavailable")
    );
    const { runStage, onCrashPointKnown } = makeRecorder();

    await expect(
      runVerifyAndSettleFlow({
        contractAddress,
        ticket,
        round: baseRound,
        runStage,
        onAttesting: () => undefined,
        onCrashPointKnown,
      })
    ).rejects.toThrow("covalidators unavailable");

    expect(onCrashPointKnown).not.toHaveBeenCalled();
    expect(crashReads.readCrashRound).not.toHaveBeenCalled();
  });

  it("skips finalize and claims when the keeper already finalized", async () => {
    const expected = computeCrashPointBps(WINNING_PLAINTEXT);
    attestation.requestCrashAttestation.mockResolvedValue({
      plaintext: WINNING_PLAINTEXT,
      signatures: ["0x01"],
    });
    crashReads.readCrashRound.mockResolvedValue(finalizedRoundRead(expected));
    const { events, runStage, onCrashPointKnown } = makeRecorder();
    const onRoundChange = vi.fn();

    await runVerifyAndSettleFlow({
      contractAddress,
      ticket,
      round: baseRound,
      runStage,
      onAttesting: () => events.push("attesting"),
      onCrashPointKnown,
      onRoundChange,
    });

    expect(runStage).not.toHaveBeenCalledWith("finalize", expect.anything());
    expect(events).toEqual([
      "stage:reveal",
      "attesting",
      `crash-point:${expected}`,
      "stage:claim",
    ]);
    expect(onRoundChange).toHaveBeenCalledWith(
      expect.objectContaining({
        status: ROUND_STATUS.finalized,
        crashPointBps: expected,
      })
    );
  });

  it("continues to claim when finalize reverts after a keeper race", async () => {
    const expected = computeCrashPointBps(WINNING_PLAINTEXT);
    attestation.requestCrashAttestation.mockResolvedValue({
      plaintext: WINNING_PLAINTEXT,
      signatures: ["0x01"],
    });
    crashReads.readCrashRound
      .mockResolvedValueOnce(openRoundRead())
      .mockResolvedValueOnce(finalizedRoundRead(expected));

    const { events, runStage, onCrashPointKnown } = makeRecorder();
    runStage.mockImplementation(async (stage: SettlementStage) => {
      events.push(`stage:${stage}`);
      if (stage === "finalize") {
        throw new Error("RoundAlreadyFinalized");
      }
    });

    await runVerifyAndSettleFlow({
      contractAddress,
      ticket,
      round: baseRound,
      runStage,
      onAttesting: () => events.push("attesting"),
      onCrashPointKnown,
    });

    expect(events).toEqual([
      "stage:reveal",
      "attesting",
      `crash-point:${expected}`,
      "stage:finalize",
      "stage:claim",
    ]);
    expect(crashReads.readCrashRound).toHaveBeenCalledTimes(2);
  });

  it("rethrows finalize failure when the round is still not finalized", async () => {
    attestation.requestCrashAttestation.mockResolvedValue({
      plaintext: WINNING_PLAINTEXT,
      signatures: ["0x01"],
    });
    crashReads.readCrashRound.mockResolvedValue(openRoundRead());

    const { runStage, onCrashPointKnown } = makeRecorder();
    runStage.mockImplementation(async (stage: SettlementStage) => {
      if (stage === "finalize") {
        throw new Error("Finalize failed");
      }
    });

    await expect(
      runVerifyAndSettleFlow({
        contractAddress,
        ticket,
        round: baseRound,
        runStage,
        onAttesting: () => undefined,
        onCrashPointKnown,
      })
    ).rejects.toThrow("Finalize failed");

    expect(runStage).not.toHaveBeenCalledWith("claim", expect.anything());
  });
});
