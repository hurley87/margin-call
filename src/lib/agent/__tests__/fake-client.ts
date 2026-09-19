import { ORACLE_STATE, type OracleState } from "@/lib/protocol/constants";
import type { BasePublicClient } from "@/lib/protocol/public-client";

/**
 * Base reads stubbed by contract function name.
 *
 * Keyed by function rather than by module so the agent tools exercise the real
 * `src/lib/protocol` loaders — a test that mocked those would stop noticing if
 * a tool read the wrong contract.
 */
export type ReadHandlers = Record<
  string,
  (args: readonly unknown[]) => unknown
>;

export type FakeClientOptions = {
  /** Throw from `simulateContract` to stand in for a reverted dry run. */
  simulate?: () => unknown;
};

export function fakeClient(
  reads: ReadHandlers,
  options: FakeClientOptions = {}
): BasePublicClient {
  return {
    readContract: async ({
      functionName,
      args = [],
    }: {
      functionName: string;
      args?: readonly unknown[];
    }) => {
      const handler = reads[functionName];
      if (!handler) {
        throw new Error(`Unstubbed Base read: ${functionName}`);
      }
      return handler(args);
    },
    simulateContract: async () => {
      const simulate = options.simulate ?? (() => ({ result: 1n }));
      return simulate();
    },
    // The agent surface prepares transactions and never sends them. These
    // exist so an accidental write fails the test instead of passing silently.
    sendTransaction: () => {
      throw new Error("the agent surface must never broadcast");
    },
    writeContract: () => {
      throw new Error("the agent surface must never broadcast");
    },
  } as unknown as BasePublicClient;
}

export function observation(
  state: OracleState,
  overrides: { price?: bigint; updatedAt?: bigint } = {}
) {
  return {
    state,
    price: overrides.price ?? 100_00000000n,
    updatedAt: overrides.updatedAt ?? 1_760_000_000n,
  };
}

type PositionFixture = {
  assetId?: number;
  stockAmount?: bigint;
  principal?: bigint;
  currentDebt?: bigint;
  owner?: `0x${string}`;
  executor?: `0x${string}`;
  thesis?: string;
  /** "unavailable" stands in for the LIVE-only `riskSnapshot` reverting. */
  risk?: { nav: bigint; liquidatable: boolean } | "unavailable";
};

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as const;

/** Reads that make `loadPosition` resolve to one live Position NFT. */
export function livePositionReads(fixture: PositionFixture = {}): ReadHandlers {
  const risk = fixture.risk ?? "unavailable";
  return {
    positions: () => ({
      assetId: BigInt(fixture.assetId ?? 1),
      stockAmount: fixture.stockAmount ?? 1_000_000n,
      principal: fixture.principal ?? 0n,
      accruedInterest: 0n,
      lastAccruedAt: 0n,
      executor: fixture.executor ?? ZERO_ADDRESS,
    }),
    currentDebt: () => fixture.currentDebt ?? 0n,
    ownerOf: () =>
      fixture.owner ?? "0x1234567890AbcdEF1234567890aBcdef12345678",
    thesisOf: () => fixture.thesis ?? "",
    riskSnapshot: () => {
      if (risk === "unavailable") throw new Error("OracleNotLive");
      return {
        nav: risk.nav,
        currentDebt: 0n,
        liquidatable: risk.liquidatable,
      };
    },
  };
}

/** Reads that make `loadOpenSnapshot` resolve for one wallet and asset. */
export function openSnapshotReads(fixture: {
  balance?: bigint;
  allowance?: bigint;
  availableCredit?: bigint;
  oracleState?: OracleState;
  contributionValue?: bigint;
}): ReadHandlers {
  return {
    balanceOf: () => fixture.balance ?? 10_000_000n,
    allowance: () => fixture.allowance ?? 0n,
    availableCredit: () => fixture.availableCredit ?? 20_000_000n,
    latestObservation: () =>
      observation(fixture.oracleState ?? ORACLE_STATE.LIVE),
    valueUsdc: () => fixture.contributionValue ?? 2_000_000n,
  };
}
