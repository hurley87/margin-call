import { describe, expect, it } from "vitest";

import {
  STATIC_TEST_FEED_STALE_AFTER,
  planMockFeedPolicy,
  type MockFeedPolicySnapshot,
} from "./asset-registry-mock-feed-policy";

const FEED = "0x0000000000000000000000000000000000000001" as const;

function snapshot(
  overrides: Partial<MockFeedPolicySnapshot> = {}
): MockFeedPolicySnapshot {
  return {
    symbol: "AMZN",
    expectedFeed: FEED,
    configuredFeed: FEED,
    staleAfter: 3_600n,
    isTestFeed: true,
    price: 18_500_000_000n,
    paused: false,
    valid: true,
    ...overrides,
  };
}

describe("static test-feed policy", () => {
  it("updates finite test feeds and skips the desired state", () => {
    expect(planMockFeedPolicy(snapshot())).toBe("update");
    expect(
      planMockFeedPolicy(snapshot({ staleAfter: STATIC_TEST_FEED_STALE_AFTER }))
    ).toBe("skip");
  });

  it.each([
    [
      { configuredFeed: "0x0000000000000000000000000000000000000002" },
      "does not match",
    ],
    [{ isTestFeed: false }, "not a disclosed test feed"],
    [{ price: 0n }, "must be positive"],
    [{ paused: true }, "feed is paused"],
    [{ valid: false }, "feed is invalid"],
  ] as const)("fails closed for an unsafe snapshot", (overrides, message) => {
    expect(() => planMockFeedPolicy(snapshot(overrides))).toThrow(message);
  });
});
