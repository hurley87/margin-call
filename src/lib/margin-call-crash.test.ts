import { beforeEach, describe, expect, it, vi } from "vitest";
import { zeroHash } from "viem";
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
const REVEAL_TRANSACTION_HASH =
  "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const FINALIZE_TRANSACTION_HASH =
  "0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc";
const EXPIRE_TRANSACTION_HASH =
  "0xdddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd";
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

  it("formats Crash Point display with the sub-1.00x product rule", async () => {
    const { formatCrashPointBps, isCrashPointPublished } =
      await import("./margin-call-crash");

    expect(formatCrashPointBps(9_900n)).toBe("1.00x");
    expect(formatCrashPointBps(10_000n)).toBe("1.00x");
    expect(formatCrashPointBps(34_200n)).toBe("3.42x");
    expect(formatCrashPointBps(100_000n)).toBe("10.00x");
    expect(formatCrashPointBps(100_001n)).toBe("10.00x");
    expect(
      isCrashPointPublished(makeRound({ status: 3, crashPointBps: 9_900n }))
    ).toBe(true);
    expect(
      isCrashPointPublished(makeRound({ status: 2, crashPointBps: 0n }))
    ).toBe(false);
    expect(
      isCrashPointPublished(makeRound({ status: 4, crashPointBps: 0n }))
    ).toBe(false);
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
      round: makeRound(),
      openingTransactionUrl: `https://sepolia.basescan.org/tx/${OPENING_TRANSACTION_HASH}`,
      revealTransactionUrl: null,
      finalizeTransactionUrl: null,
      expireTransactionUrl: null,
      gameContractUrl: `https://sepolia.basescan.org/address/${CONTRACT_ADDRESS}#code`,
      incoContractUrl:
        "https://sepolia.basescan.org/address/0x4b9911b0191B0b6a6eA8F2Ed562e20Cff5AC8624#code",
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

  it("resolves lifecycle transactions for finalized and expired rounds", async () => {
    sdk.getBlock.mockResolvedValue({ number: 100n, timestamp: 1_020n });
    sdk.readContract
      .mockResolvedValueOnce(900n)
      .mockResolvedValueOnce(3n)
      .mockResolvedValueOnce(makeRound({ status: 3, crashPointBps: 34_200n }));
    sdk.getLogs
      .mockResolvedValueOnce([{ transactionHash: OPENING_TRANSACTION_HASH }])
      .mockResolvedValueOnce([{ transactionHash: REVEAL_TRANSACTION_HASH }])
      .mockResolvedValueOnce([{ transactionHash: FINALIZE_TRANSACTION_HASH }]);
    const { readCurrentCrashRound } = await import("./margin-call-crash");

    await expect(
      readCurrentCrashRound({
        address: CONTRACT_ADDRESS,
        deploymentBlock: 50n,
      })
    ).resolves.toMatchObject({
      round: { status: 3, crashPointBps: 34_200n },
      openingTransactionUrl: `https://sepolia.basescan.org/tx/${OPENING_TRANSACTION_HASH}`,
      revealTransactionUrl: `https://sepolia.basescan.org/tx/${REVEAL_TRANSACTION_HASH}`,
      finalizeTransactionUrl: `https://sepolia.basescan.org/tx/${FINALIZE_TRANSACTION_HASH}`,
      expireTransactionUrl: null,
    });

    vi.resetModules();
    sdk.getBlock.mockResolvedValue({ number: 101n, timestamp: 2_000n });
    sdk.readContract
      .mockResolvedValueOnce(900n)
      .mockResolvedValueOnce(3n)
      .mockResolvedValueOnce(makeRound({ status: 4 }));
    sdk.getLogs
      .mockResolvedValueOnce([{ transactionHash: OPENING_TRANSACTION_HASH }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ transactionHash: EXPIRE_TRANSACTION_HASH }]);
    const { readCurrentCrashRound: readExpired } =
      await import("./margin-call-crash");

    await expect(
      readExpired({
        address: CONTRACT_ADDRESS,
        deploymentBlock: 50n,
      })
    ).resolves.toMatchObject({
      round: { status: 4 },
      expireTransactionUrl: `https://sepolia.basescan.org/tx/${EXPIRE_TRANSACTION_HASH}`,
      finalizeTransactionUrl: null,
      revealTransactionUrl: null,
    });
  });

  it("reuses immutable and already-observed reads across polls", async () => {
    sdk.getBlock.mockResolvedValue({ number: 100n, timestamp: 1_020n });
    sdk.readContract.mockImplementation(({ functionName }) => {
      if (functionName === "epochOrigin") return Promise.resolve(900n);
      if (functionName === "currentRoundId") return Promise.resolve(3n);
      return Promise.resolve(makeRound());
    });
    sdk.getLogs.mockResolvedValue([
      { transactionHash: OPENING_TRANSACTION_HASH },
    ]);
    const { readCurrentCrashRound } = await import("./margin-call-crash");
    const config = { address: CONTRACT_ADDRESS, deploymentBlock: 50n } as const;

    await readCurrentCrashRound(config);
    await readCurrentCrashRound(config);

    const epochOriginReads = sdk.readContract.mock.calls.filter(
      ([request]) => request.functionName === "epochOrigin"
    );
    expect(epochOriginReads).toHaveLength(1);
    expect(sdk.getLogs).toHaveBeenCalledOnce();
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
      round: { status: 0 },
      openingTransactionUrl: null,
    });
    expect(sdk.getLogs).not.toHaveBeenCalled();
  });

  it("bounds opening-event lookup to recent blocks on aged deployments", async () => {
    sdk.getBlock.mockResolvedValue({ number: 1_000n, timestamp: 1_020n });
    sdk.readContract
      .mockResolvedValueOnce(900n)
      .mockResolvedValueOnce(3n)
      .mockResolvedValueOnce(makeRound());
    sdk.getLogs.mockResolvedValue([
      { transactionHash: OPENING_TRANSACTION_HASH },
    ]);
    const { readCurrentCrashRound } = await import("./margin-call-crash");

    await readCurrentCrashRound({
      address: CONTRACT_ADDRESS,
      deploymentBlock: 50n,
    });

    expect(sdk.getLogs).toHaveBeenCalledWith(
      expect.objectContaining({
        fromBlock: 488n,
        toBlock: 1_000n,
      })
    );
  });

  it("represents a configured future epoch without calling the reverting current-round view", async () => {
    sdk.getBlock.mockResolvedValue({ number: 100n, timestamp: 1_020n });
    sdk.readContract
      .mockResolvedValueOnce(1_200n)
      .mockResolvedValueOnce([1_200n, 1_245n, 2_145n]);
    const { readCurrentCrashRound } = await import("./margin-call-crash");

    await expect(
      readCurrentCrashRound({
        address: CONTRACT_ADDRESS,
        deploymentBlock: 50n,
      })
    ).resolves.toMatchObject({
      currentRoundId: 0n,
      round: {
        openAt: 1_200n,
        lockAt: 1_245n,
        expiresAt: 2_145n,
        crashRandom: zeroHash,
        status: 0,
      },
    });
    expect(sdk.readContract).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        functionName: "roundTimes",
        args: [0n],
        blockNumber: 100n,
      })
    );
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

  it("rejects duplicate lifecycle events during reconstruction", async () => {
    sdk.getBlock.mockResolvedValue({ number: 100n, timestamp: 1_020n });
    sdk.readContract
      .mockResolvedValueOnce(900n)
      .mockResolvedValueOnce(3n)
      .mockResolvedValueOnce(makeRound({ status: 3, crashPointBps: 9_900n }));
    sdk.getLogs
      .mockResolvedValueOnce([{ transactionHash: OPENING_TRANSACTION_HASH }])
      .mockResolvedValueOnce([{ transactionHash: REVEAL_TRANSACTION_HASH }])
      .mockResolvedValueOnce([
        { transactionHash: FINALIZE_TRANSACTION_HASH },
        { transactionHash: FINALIZE_TRANSACTION_HASH },
      ]);
    const { readCurrentCrashRound } = await import("./margin-call-crash");

    await expect(
      readCurrentCrashRound({
        address: CONTRACT_ADDRESS,
        deploymentBlock: 50n,
      })
    ).rejects.toThrow("Expected one RoundFinalized event for round 3, found 2");
  });
});

function makeRound(overrides: Partial<CrashRound> = {}): CrashRound {
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
    ...overrides,
  };
}
