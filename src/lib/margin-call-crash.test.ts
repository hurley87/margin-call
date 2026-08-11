import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CrashRound } from "./margin-call-crash";

const sdk = vi.hoisted(() => ({
  getBlock: vi.fn(),
  getLogs: vi.fn(),
  readContract: vi.fn(),
}));

vi.mock("./base-sepolia", () => ({
  baseSepoliaPublicClient: {
    getBlock: (...args: unknown[]) => sdk.getBlock(...args),
    getLogs: (...args: unknown[]) => sdk.getLogs(...args),
    readContract: (...args: unknown[]) => sdk.readContract(...args),
  },
}));

const CONTRACT_ADDRESS = "0x0000000000000000000000000000000000000001";
const OPENING_TRANSACTION_HASH =
  "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const RANDOM_HANDLE =
  "0x000000000000000000000000000000000000000000000000000000000000cafe";

describe("MarginCallCrash public reads and phase math", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    sdk.getBlock.mockReset();
    sdk.getLogs.mockReset();
    sdk.readContract.mockReset();
  });

  it("derives exact open, locked, and expiry-eligible boundaries", async () => {
    const { deriveRoundPhase } = await import("./margin-call-crash");
    const round = {
      id: 3n,
      openAt: 1_000n,
      lockAt: 1_045n,
      expiresAt: 1_945n,
      crashRandom:
        "0x000000000000000000000000000000000000000000000000000000000000cafe" as const,
      crashPointBps: 0n,
      totalMargin: 0n,
      reservedPayout: 0n,
      status: 1,
    } as const;

    expect(deriveRoundPhase(round, 1_044n)).toBe("open");
    expect(deriveRoundPhase(round, 1_045n)).toBe("locked");
    expect(deriveRoundPhase(round, 1_944n)).toBe("locked");
    expect(deriveRoundPhase(round, 1_945n)).toBe("expired-eligible");
  });

  it("honors stored lifecycle states before timestamp-derived phases", async () => {
    const { deriveRoundPhase, getRoundCountdownSeconds } =
      await import("./margin-call-crash");
    const round = makeRound();

    expect(deriveRoundPhase({ ...round, status: 0 }, round.openAt)).toBe(
      "uninitialized"
    );
    expect(deriveRoundPhase({ ...round, status: 2 }, round.lockAt)).toBe(
      "reveal-requested"
    );
    expect(deriveRoundPhase({ ...round, status: 3 }, round.openAt)).toBe(
      "finalized"
    );
    expect(deriveRoundPhase({ ...round, status: 4 }, round.openAt)).toBe(
      "expired"
    );
    expect(getRoundCountdownSeconds(round, round.lockAt - 10n)).toBe(10);
    expect(getRoundCountdownSeconds(round, round.lockAt)).toBe(0);
  });

  it("requires valid public address and deployment-block configuration", async () => {
    vi.stubEnv("NEXT_PUBLIC_MARGIN_CALL_CRASH_ADDRESS", CONTRACT_ADDRESS);
    vi.stubEnv("NEXT_PUBLIC_MARGIN_CALL_CRASH_DEPLOYMENT_BLOCK", "45314000");
    const { getMarginCallCrashConfig } = await import("./margin-call-crash");

    expect(getMarginCallCrashConfig()).toEqual({
      address: CONTRACT_ADDRESS,
      deploymentBlock: 45_314_000n,
    });

    vi.stubEnv("NEXT_PUBLIC_MARGIN_CALL_CRASH_DEPLOYMENT_BLOCK", "-1");
    expect(getMarginCallCrashConfig()).toBeNull();
    vi.stubEnv("NEXT_PUBLIC_MARGIN_CALL_CRASH_ADDRESS", "invalid");
    expect(getMarginCallCrashConfig()).toBeNull();
  });

  it("reads one block-consistent round and resolves its exact opening transaction", async () => {
    sdk.getBlock.mockResolvedValue({ number: 100n, timestamp: 1_020n });
    sdk.readContract
      .mockResolvedValueOnce(900n)
      .mockResolvedValueOnce(3n)
      .mockResolvedValueOnce(makeRound());
    sdk.getLogs.mockResolvedValue([
      { transactionHash: OPENING_TRANSACTION_HASH },
    ]);
    const { readCurrentCrashRound } = await import("./margin-call-crash");

    await expect(
      readCurrentCrashRound({
        address: CONTRACT_ADDRESS,
        deploymentBlock: 50n,
      })
    ).resolves.toMatchObject({
      blockNumber: 100n,
      chainTimestamp: 1_020n,
      currentRoundId: 3n,
      phase: "open",
      countdownSeconds: 25,
      openingTransactionHash: OPENING_TRANSACTION_HASH,
      openingTransactionUrl: `https://sepolia.basescan.org/tx/${OPENING_TRANSACTION_HASH}`,
    });
    expect(sdk.readContract).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        functionName: "currentRoundId",
        blockNumber: 100n,
      })
    );
    expect(sdk.readContract).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        functionName: "getRound",
        args: [3n],
        blockNumber: 100n,
      })
    );
    expect(sdk.getLogs).toHaveBeenCalledWith(
      expect.objectContaining({
        address: CONTRACT_ADDRESS,
        args: { roundId: 3n },
        fromBlock: 50n,
        toBlock: 100n,
      })
    );
  });

  it("skips event lookup for an uninitialized current epoch", async () => {
    sdk.getBlock.mockResolvedValue({ number: 100n, timestamp: 1_020n });
    sdk.readContract
      .mockResolvedValueOnce(900n)
      .mockResolvedValueOnce(3n)
      .mockResolvedValueOnce(makeRound({ status: 0 }));
    const { readCurrentCrashRound } = await import("./margin-call-crash");

    await expect(
      readCurrentCrashRound({
        address: CONTRACT_ADDRESS,
        deploymentBlock: 50n,
      })
    ).resolves.toMatchObject({
      phase: "uninitialized",
      openingTransactionHash: null,
      openingTransactionUrl: null,
    });
    expect(sdk.getLogs).not.toHaveBeenCalled();
  });

  it("represents a configured future epoch without calling the reverting current-round view", async () => {
    sdk.getBlock.mockResolvedValue({ number: 100n, timestamp: 1_020n });
    sdk.readContract
      .mockResolvedValueOnce(1_200n)
      .mockResolvedValueOnce(45n)
      .mockResolvedValueOnce(900n);
    const { readCurrentCrashRound } = await import("./margin-call-crash");

    await expect(
      readCurrentCrashRound({
        address: CONTRACT_ADDRESS,
        deploymentBlock: 50n,
      })
    ).resolves.toMatchObject({
      currentRoundId: 0n,
      phase: "prelaunch",
      countdownSeconds: 0,
      round: {
        openAt: 1_200n,
        lockAt: 1_245n,
        expiresAt: 2_145n,
        status: 0,
      },
    });
    expect(
      sdk.readContract.mock.calls.some(
        ([request]) => request.functionName === "currentRoundId"
      )
    ).toBe(false);
    expect(sdk.getLogs).not.toHaveBeenCalled();
  });

  it("rejects initialized state without exactly one reconstructable opening event", async () => {
    sdk.getBlock.mockResolvedValue({ number: 100n, timestamp: 1_020n });
    sdk.readContract
      .mockResolvedValueOnce(900n)
      .mockResolvedValueOnce(3n)
      .mockResolvedValueOnce(makeRound());
    sdk.getLogs.mockResolvedValue([]);
    const { readCurrentCrashRound } = await import("./margin-call-crash");

    await expect(
      readCurrentCrashRound({
        address: CONTRACT_ADDRESS,
        deploymentBlock: 50n,
      })
    ).rejects.toThrow("Expected one RoundOpened event for round 3");
  });
});

function makeRound(overrides: Partial<CrashRound> = {}): CrashRound {
  return { ...makeRoundBase(), ...overrides };
}

function makeRoundBase(): CrashRound {
  return {
    id: 3n,
    openAt: 1_000n,
    lockAt: 1_045n,
    expiresAt: 1_945n,
    crashRandom: RANDOM_HANDLE,
    crashPointBps: 0n,
    totalMargin: 0n,
    reservedPayout: 0n,
    status: 1,
  };
}
