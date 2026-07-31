import { maxUint64, type Address } from "viem";

export const STATIC_TEST_FEED_STALE_AFTER = maxUint64;

export type MockFeedPolicySnapshot = {
  symbol: string;
  expectedFeed: Address;
  configuredFeed: Address;
  staleAfter: bigint;
  isTestFeed: boolean;
  price: bigint;
  paused: boolean;
  valid: boolean;
};

export function planMockFeedPolicy(
  snapshot: MockFeedPolicySnapshot
): "skip" | "update" {
  if (
    snapshot.configuredFeed.toLowerCase() !==
    snapshot.expectedFeed.toLowerCase()
  ) {
    throw new Error(
      `${snapshot.symbol}: configured feed does not match the committed deployment record`
    );
  }
  if (!snapshot.isTestFeed) {
    throw new Error(`${snapshot.symbol}: feed is not a disclosed test feed`);
  }
  if (snapshot.price <= 0n) {
    throw new Error(`${snapshot.symbol}: feed price must be positive`);
  }
  if (snapshot.paused) {
    throw new Error(
      `${snapshot.symbol}: feed is paused; refusing to reconfigure`
    );
  }
  if (!snapshot.valid) {
    throw new Error(
      `${snapshot.symbol}: feed is invalid; refusing to reconfigure`
    );
  }

  return snapshot.staleAfter === STATIC_TEST_FEED_STALE_AFTER
    ? "skip"
    : "update";
}
