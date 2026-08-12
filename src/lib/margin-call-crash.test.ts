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

  it("computes payout math and entry offer rules for the bounded UI", async () => {
    const {
      BOUNDED_ENTRY_ALLOWANCE_TUSD,
      canOfferEntry,
      computeMaximumPayout,
      computeTicketPayout,
      deriveTicketOutcome,
      ENTRY_CUTOFF_SECONDS,
      formatLeverageBps,
      isWinningTicket,
    } = await import("./margin-call-crash");

    expect(computeMaximumPayout(1_000_000n, 12_500n)).toBe(1_250_000n);
    expect(computeMaximumPayout(10_000_000n, 100_000n)).toBe(100_000_000n);
    expect(isWinningTicket(12_500n, 12_500n)).toBe(true);
    expect(isWinningTicket(12_500n, 12_499n)).toBe(false);
    expect(computeTicketPayout(1_000_000n, 12_500n, 12_500n)).toBe(1_250_000n);
    expect(computeTicketPayout(1_000_000n, 12_500n, 9_900n)).toBe(0n);
    expect(formatLeverageBps(12_500n)).toBe("1.25x");
    expect(formatLeverageBps(100_000n)).toBe("10.00x");
    expect(BOUNDED_ENTRY_ALLOWANCE_TUSD).toBe(1_000_000_000n);
    expect(ENTRY_CUTOFF_SECONDS).toBe(5);
    expect(canOfferEntry("open", 6)).toBe(true);
    expect(canOfferEntry("open", 5)).toBe(false);
    expect(canOfferEntry("uninitialized", 40)).toBe(false);
    expect(
      deriveTicketOutcome(
        {
          id: 1n,
          player: CONTRACT_ADDRESS,
          roundId: 3n,
          margin: 1_000_000n,
          leverageBps: 12_500n,
          reservedPayout: 1_250_000n,
          settled: false,
          claimed: false,
        },
        makeRound({ status: 3, crashPointBps: 12_500n })
      )
    ).toBe("won");
    expect(
      deriveTicketOutcome(
        {
          id: 2n,
          player: CONTRACT_ADDRESS,
          roundId: 4n,
          margin: 1_000_000n,
          leverageBps: 12_500n,
          reservedPayout: 1_250_000n,
          settled: false,
          claimed: false,
        },
        makeRound({ status: 4, crashPointBps: 0n })
      )
    ).toBe("refundable");
    expect(
      deriveTicketOutcome(
        {
          id: 3n,
          player: CONTRACT_ADDRESS,
          roundId: 4n,
          margin: 1_000_000n,
          leverageBps: 12_500n,
          reservedPayout: 1_250_000n,
          settled: true,
          claimed: false,
        },
        makeRound({ status: 4, crashPointBps: 0n })
      )
    ).toBe("refunded");
  });

  it("exposes expiry refund eligibility helpers", async () => {
    const { canExpireRound, isRefundable } =
      await import("./margin-call-crash");
    const ticket = {
      id: 1n,
      player: CONTRACT_ADDRESS as `0x${string}`,
      roundId: 3n,
      margin: 1_000_000n,
      leverageBps: 12_500n,
      reservedPayout: 1_250_000n,
      settled: false,
      claimed: false,
    };
    const expiredEligible = makeRound({ status: 1, expiresAt: 1_000n });
    expect(canExpireRound(expiredEligible, 1_000n)).toBe(true);
    expect(canExpireRound(expiredEligible, 999n)).toBe(false);
    expect(isRefundable(ticket, makeRound({ status: 4 }))).toBe(true);
    expect(isRefundable(ticket, makeRound({ status: 3 }))).toBe(false);
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
      .mockResolvedValueOnce([
        {
          transactionHash: FINALIZE_TRANSACTION_HASH,
          blockNumber: 95n,
        },
      ]);
    const { readCurrentCrashRound } = await import("./margin-call-crash");

    await expect(
      readCurrentCrashRound({
        address: CONTRACT_ADDRESS,
        deploymentBlock: 50n,
      })
    ).resolves.toMatchObject({
      round: { status: 3, crashPointBps: 34_200n },
      finalizedAtSeconds: 1_020n,
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

  it("caches a permanently absent reveal for expired rounds", async () => {
    sdk.getBlock.mockResolvedValue({ number: 100n, timestamp: 2_000n });
    sdk.readContract.mockImplementation(({ functionName }) => {
      if (functionName === "epochOrigin") return Promise.resolve(900n);
      if (functionName === "currentRoundId") return Promise.resolve(3n);
      return Promise.resolve(makeRound({ status: 4 }));
    });
    sdk.getLogs.mockImplementation(({ event }) =>
      Promise.resolve(
        event.name === "RevealRequested"
          ? []
          : [
              {
                transactionHash:
                  event.name === "RoundOpened"
                    ? OPENING_TRANSACTION_HASH
                    : EXPIRE_TRANSACTION_HASH,
              },
            ]
      )
    );
    const { readCurrentCrashRound } = await import("./margin-call-crash");
    const config = { address: CONTRACT_ADDRESS, deploymentBlock: 50n } as const;

    await expect(readCurrentCrashRound(config)).resolves.toMatchObject({
      revealTransactionUrl: null,
      expireTransactionUrl: `https://sepolia.basescan.org/tx/${EXPIRE_TRANSACTION_HASH}`,
    });
    expect(sdk.getLogs).toHaveBeenCalledTimes(3);

    await readCurrentCrashRound(config);
    expect(sdk.getLogs).toHaveBeenCalledTimes(3);
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

  it("reads global history with honest crash points for delayed and expired rounds", async () => {
    sdk.getBlock.mockResolvedValue({ number: 100n, timestamp: 2_000n });
    sdk.readContract.mockImplementation(({ functionName, args }) => {
      if (functionName === "currentRoundId") return Promise.resolve(5n);
      if (functionName === "getRound") {
        const roundId = args?.[0] as bigint;
        if (roundId === 5n) {
          return Promise.resolve(
            makeRound({
              id: 5n,
              status: 2,
              lockAt: 1_000n,
              expiresAt: 5_000n,
              crashPointBps: 0n,
            })
          );
        }
        if (roundId === 4n) {
          return Promise.resolve(
            makeRound({ id: 4n, status: 4, crashPointBps: 0n })
          );
        }
        if (roundId === 3n) {
          return Promise.resolve(
            makeRound({ id: 3n, status: 3, crashPointBps: 34_200n })
          );
        }
        if (roundId === 2n) {
          return Promise.resolve(makeRound({ id: 2n, status: 0 }));
        }
        if (roundId === 1n) {
          return Promise.resolve(
            makeRound({ id: 1n, status: 3, crashPointBps: 12_500n })
          );
        }
        return Promise.resolve(makeRound({ id: roundId, status: 0 }));
      }
      return Promise.reject(new Error(`unexpected ${functionName}`));
    });
    const { GLOBAL_HISTORY_LOOKBACK_ROUNDS, readRecentRoundHistory } =
      await import("./margin-call-crash");

    expect(GLOBAL_HISTORY_LOOKBACK_ROUNDS).toBe(20);
    const history = await readRecentRoundHistory({
      address: CONTRACT_ADDRESS,
      deploymentBlock: 50n,
    });

    expect(history.map((item) => item.round.id)).toEqual([5n, 4n, 3n, 1n]);
    expect(history[0]).toMatchObject({
      historyState: "delayed",
      displayCrashPoint: null,
      phase: "reveal-requested",
    });
    expect(history[1]).toMatchObject({
      historyState: "expired",
      displayCrashPoint: null,
    });
    expect(history[2]).toMatchObject({
      historyState: "finalized",
      displayCrashPoint: "3.42x",
    });
    expect(history[3]).toMatchObject({
      historyState: "finalized",
      displayCrashPoint: "1.25x",
    });
  });

  it("loads round verification detail with lifecycle and settlement BaseScan links", async () => {
    const CLAIM_HASH =
      "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";
    const ENTER_HASH =
      "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";
    sdk.getBlock.mockResolvedValue({ number: 100n, timestamp: 2_000n });
    sdk.readContract.mockResolvedValue(
      makeRound({
        id: 3n,
        status: 3,
        crashPointBps: 34_200n,
        totalMargin: 5_000_000n,
        reservedPayout: 6_250_000n,
      })
    );
    sdk.getLogs.mockImplementation(({ event }) => {
      if (event.name === "RoundOpened") {
        return Promise.resolve([{ transactionHash: OPENING_TRANSACTION_HASH }]);
      }
      if (event.name === "RevealRequested") {
        return Promise.resolve([{ transactionHash: REVEAL_TRANSACTION_HASH }]);
      }
      if (event.name === "RoundFinalized") {
        return Promise.resolve([
          { transactionHash: FINALIZE_TRANSACTION_HASH },
        ]);
      }
      if (event.name === "TicketEntered") {
        return Promise.resolve([{ transactionHash: ENTER_HASH }]);
      }
      if (event.name === "TicketClaimed") {
        return Promise.resolve([{ transactionHash: CLAIM_HASH }]);
      }
      if (event.name === "TicketRefunded") {
        return Promise.resolve([]);
      }
      return Promise.resolve([]);
    });
    const { readRoundHistoryDetail } = await import("./margin-call-crash");

    await expect(
      readRoundHistoryDetail(
        { address: CONTRACT_ADDRESS, deploymentBlock: 50n },
        3n
      )
    ).resolves.toMatchObject({
      historyState: "finalized",
      displayCrashPoint: "3.42x",
      round: {
        id: 3n,
        totalMargin: 5_000_000n,
        reservedPayout: 6_250_000n,
        crashRandom: RANDOM_HANDLE,
        crashPointBps: 34_200n,
      },
      openingTransactionUrl: `https://sepolia.basescan.org/tx/${OPENING_TRANSACTION_HASH}`,
      revealTransactionUrl: `https://sepolia.basescan.org/tx/${REVEAL_TRANSACTION_HASH}`,
      finalizeTransactionUrl: `https://sepolia.basescan.org/tx/${FINALIZE_TRANSACTION_HASH}`,
      ticketEnteredTransactionUrls: [
        `https://sepolia.basescan.org/tx/${ENTER_HASH}`,
      ],
      ticketClaimedTransactionUrls: [
        `https://sepolia.basescan.org/tx/${CLAIM_HASH}`,
      ],
      ticketRefundedTransactionUrls: [],
    });
    expect(sdk.getLogs).toHaveBeenCalledWith(
      expect.objectContaining({
        fromBlock: 50n,
        toBlock: 100n,
        args: { roundId: 3n },
      })
    );
  });

  it("reads every player ticket in the lookback with actionable settlement state", async () => {
    const player = "0x00000000000000000000000000000000000000aa" as const;
    sdk.getBlock.mockResolvedValue({ number: 100n, timestamp: 2_000n });
    sdk.readContract.mockImplementation(({ functionName, args }) => {
      if (functionName === "currentRoundId") return Promise.resolve(4n);
      if (functionName === "getTicketId") {
        const roundId = args?.[0] as bigint;
        if (roundId === 4n) return Promise.resolve(40n);
        if (roundId === 3n) return Promise.resolve(30n);
        if (roundId === 2n) return Promise.resolve(0n);
        if (roundId === 1n) return Promise.resolve(10n);
        return Promise.resolve(0n);
      }
      if (functionName === "getTicket") {
        const ticketId = args?.[0] as bigint;
        if (ticketId === 40n) {
          return Promise.resolve({
            id: 40n,
            player,
            roundId: 4n,
            margin: 1_000_000n,
            leverageBps: 12_500n,
            reservedPayout: 1_250_000n,
            settled: false,
            claimed: false,
          });
        }
        if (ticketId === 30n) {
          return Promise.resolve({
            id: 30n,
            player,
            roundId: 3n,
            margin: 5_000_000n,
            leverageBps: 20_000n,
            reservedPayout: 10_000_000n,
            settled: false,
            claimed: false,
          });
        }
        if (ticketId === 10n) {
          return Promise.resolve({
            id: 10n,
            player,
            roundId: 1n,
            margin: 1_000_000n,
            leverageBps: 12_500n,
            reservedPayout: 1_250_000n,
            settled: true,
            claimed: true,
          });
        }
        return Promise.reject(new Error(`unexpected ticket ${ticketId}`));
      }
      if (functionName === "getRound") {
        const roundId = args?.[0] as bigint;
        if (roundId === 4n) {
          return Promise.resolve(
            makeRound({ id: 4n, status: 4, crashPointBps: 0n })
          );
        }
        if (roundId === 3n) {
          return Promise.resolve(
            makeRound({ id: 3n, status: 3, crashPointBps: 34_200n })
          );
        }
        if (roundId === 1n) {
          return Promise.resolve(
            makeRound({ id: 1n, status: 3, crashPointBps: 12_500n })
          );
        }
        return Promise.resolve(makeRound({ id: roundId, status: 0 }));
      }
      return Promise.reject(new Error(`unexpected ${functionName}`));
    });
    const { readPlayerTicketHistory } = await import("./margin-call-crash");

    const history = await readPlayerTicketHistory(
      { address: CONTRACT_ADDRESS, deploymentBlock: 50n },
      player
    );

    expect(history).toHaveLength(3);
    expect(history[0]).toMatchObject({
      ticket: { id: 40n },
      outcome: "refundable",
      displayCrashPoint: null,
      payout: null,
      amountKind: "refund",
      displayAmount: 1_000_000n,
      canRefund: true,
      canClaim: false,
      canVerify: false,
      canExpire: false,
    });
    expect(history[1]).toMatchObject({
      ticket: { id: 30n },
      outcome: "won",
      displayCrashPoint: "3.42x",
      payout: 10_000_000n,
      amountKind: "payout",
      displayAmount: 10_000_000n,
      canClaim: true,
      canSettle: false,
      canVerify: false,
      canRefund: false,
      canExpire: false,
    });
    expect(history[2]).toMatchObject({
      ticket: { id: 10n },
      outcome: "settled-win",
      displayCrashPoint: "1.25x",
      payout: 1_250_000n,
      amountKind: "payout",
      displayAmount: 1_250_000n,
      canClaim: false,
      canRefund: false,
      canExpire: false,
    });
  });
  it("aggregates TicketEntered rows into per-tier exposure using reservedPayout", async () => {
    const { aggregateTierExposure, ENTRY_LEVERAGE_TIERS_BPS } =
      await import("./margin-call-crash");

    const tiers = aggregateTierExposure([
      {
        leverageBps: 12_500n,
        margin: 1_000_000n,
        reservedPayout: 1_250_000n,
      },
      {
        leverageBps: 12_500n,
        margin: 5_000_000n,
        reservedPayout: 6_250_000n,
      },
      {
        leverageBps: 20_000n,
        margin: 10_000_000n,
        reservedPayout: 20_000_000n,
      },
      // Unknown leverage is skipped (contracts reject it at entry).
      {
        leverageBps: 11_000n,
        margin: 1_000_000n,
        reservedPayout: 1_100_000n,
      },
    ]);

    expect(tiers).toHaveLength(ENTRY_LEVERAGE_TIERS_BPS.length);
    expect(tiers[0]).toEqual({
      leverageBps: 12_500n,
      ticketCount: 2,
      totalMargin: 6_000_000n,
      reservedPayout: 7_500_000n,
    });
    expect(tiers[2]).toEqual({
      leverageBps: 20_000n,
      ticketCount: 1,
      totalMargin: 10_000_000n,
      reservedPayout: 20_000_000n,
    });
    expect(tiers[1]?.ticketCount).toBe(0);
    expect(tiers[5]?.ticketCount).toBe(0);
  });

  it("reads the ticket tape and per-tier aggregates for a round", async () => {
    const playerA = "0x00000000000000000000000000000000000000aa";
    const playerB = "0x00000000000000000000000000000000000000bb";
    sdk.getBlock.mockResolvedValue({ number: 100n, timestamp: 2_000n });
    sdk.getLogs.mockResolvedValue([
      {
        args: {
          roundId: 3n,
          ticketId: 10n,
          player: playerA,
          margin: 1_000_000n,
          leverageBps: 12_500n,
          reservedPayout: 1_250_000n,
        },
        transactionHash: OPENING_TRANSACTION_HASH,
      },
      {
        args: {
          roundId: 3n,
          ticketId: 11n,
          player: playerB,
          margin: 5_000_000n,
          leverageBps: 20_000n,
          reservedPayout: 10_000_000n,
        },
        transactionHash: REVEAL_TRANSACTION_HASH,
      },
    ]);
    const { readRoundTicketTape } = await import("./margin-call-crash");

    const tape = await readRoundTicketTape(
      { address: CONTRACT_ADDRESS, deploymentBlock: 50n },
      3n
    );

    expect(tape.roundId).toBe(3n);
    expect(tape.entries).toHaveLength(2);
    expect(tape.entries[0]).toMatchObject({
      ticketId: 10n,
      player: playerA,
      leverageBps: 12_500n,
      reservedPayout: 1_250_000n,
    });
    expect(tape.tiers[0]?.ticketCount).toBe(1);
    expect(tape.tiers[2]?.ticketCount).toBe(1);
    expect(tape.tiers[2]?.reservedPayout).toBe(10_000_000n);
  });

  it("finds the latest finalized round for ambiance replay", async () => {
    sdk.getBlock
      .mockResolvedValueOnce({ number: 100n, timestamp: 2_000n })
      .mockResolvedValueOnce({ number: 90n, timestamp: 1_800n });
    sdk.readContract.mockImplementation(({ functionName, args }) => {
      if (functionName === "currentRoundId") return Promise.resolve(5n);
      if (functionName === "getRound") {
        const roundId = args?.[0] as bigint;
        if (roundId === 5n) {
          return Promise.resolve(
            makeRound({ id: 5n, status: 1, crashPointBps: 0n })
          );
        }
        if (roundId === 4n) {
          return Promise.resolve(
            makeRound({ id: 4n, status: 2, crashPointBps: 0n })
          );
        }
        if (roundId === 3n) {
          return Promise.resolve(
            makeRound({ id: 3n, status: 3, crashPointBps: 34_200n })
          );
        }
        return Promise.resolve(makeRound({ id: roundId, status: 0 }));
      }
      return Promise.reject(new Error(`unexpected ${functionName}`));
    });
    sdk.getLogs.mockImplementation(({ event }) => {
      if (event.name === "RoundFinalized") {
        return Promise.resolve([
          {
            transactionHash: FINALIZE_TRANSACTION_HASH,
            blockNumber: 90n,
          },
        ]);
      }
      if (event.name === "RoundOpened") {
        return Promise.resolve([{ transactionHash: OPENING_TRANSACTION_HASH }]);
      }
      if (event.name === "RevealRequested") {
        return Promise.resolve([{ transactionHash: REVEAL_TRANSACTION_HASH }]);
      }
      return Promise.resolve([]);
    });
    const { readLatestFinalizedReplayRound } =
      await import("./margin-call-crash");

    const ambiance = await readLatestFinalizedReplayRound({
      address: CONTRACT_ADDRESS,
      deploymentBlock: 50n,
    });

    expect(ambiance).toMatchObject({
      displayCrashPoint: "3.42x",
      finalizedAtSeconds: 1_800n,
      round: { id: 3n, crashPointBps: 34_200n, status: 3 },
    });
  });

  it("caches the finalize timestamp and returns it from current-round reads", async () => {
    vi.stubEnv("NEXT_PUBLIC_MARGIN_CALL_CRASH_ADDRESS", CONTRACT_ADDRESS);
    vi.stubEnv("NEXT_PUBLIC_MARGIN_CALL_CRASH_DEPLOYMENT_BLOCK", "50");
    sdk.getBlock
      .mockResolvedValueOnce({ number: 100n, timestamp: 2_000n })
      .mockResolvedValueOnce({ number: 95n, timestamp: 1_950n });
    sdk.readContract
      .mockResolvedValueOnce(1_000n) // epochOrigin
      .mockResolvedValueOnce(3n) // currentRoundId
      .mockResolvedValueOnce(makeRound({ status: 3, crashPointBps: 25_000n }));
    sdk.getLogs.mockImplementation(({ event }) => {
      if (event.name === "RoundOpened") {
        return Promise.resolve([{ transactionHash: OPENING_TRANSACTION_HASH }]);
      }
      if (event.name === "RevealRequested") {
        return Promise.resolve([{ transactionHash: REVEAL_TRANSACTION_HASH }]);
      }
      if (event.name === "RoundFinalized") {
        return Promise.resolve([
          {
            transactionHash: FINALIZE_TRANSACTION_HASH,
            blockNumber: 95n,
          },
        ]);
      }
      return Promise.resolve([]);
    });
    const { readCurrentCrashRound } = await import("./margin-call-crash");

    const result = await readCurrentCrashRound({
      address: CONTRACT_ADDRESS,
      deploymentBlock: 50n,
    });

    expect(result.finalizedAtSeconds).toBe(1_950n);
    expect(result.round.crashPointBps).toBe(25_000n);
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
