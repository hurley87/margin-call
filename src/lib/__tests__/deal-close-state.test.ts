import { describe, expect, it } from "vitest";

import {
  closeDealButtonLabel,
  closeDealErrorMessage,
  isCloseDealBusy,
  type CloseDealPhase,
} from "@/lib/deal-close-state";

describe("deal close state helpers", () => {
  it.each([
    ["idle", false, "CLOSE DEAL"],
    ["wallet", false, "CONFIRM IN WALLET..."],
    ["confirming", false, "CLOSING..."],
    ["syncing", false, "SYNCING..."],
    ["done", false, "CLOSE DEAL"],
    ["error", false, "CLOSE DEAL"],
    ["idle", true, "SYNC CLOSED DEAL"],
    ["error", true, "RETRY SYNC"],
  ] satisfies [CloseDealPhase, boolean, string][])(
    "returns deterministic label for %s / on-chain closed %s",
    (phase, isOnChainClosed, label) => {
      expect(closeDealButtonLabel(phase, isOnChainClosed)).toBe(label);
    }
  );

  it.each([
    ["idle", false],
    ["wallet", true],
    ["confirming", true],
    ["syncing", true],
    ["done", false],
    ["error", false],
  ] satisfies [CloseDealPhase, boolean][])(
    "reports busy state for %s",
    (phase, busy) => {
      expect(isCloseDealBusy(phase)).toBe(busy);
    }
  );

  it("keeps useful error messages", () => {
    expect(closeDealErrorMessage(new Error("User rejected"))).toBe(
      "User rejected"
    );
    expect(closeDealErrorMessage("Contract reverted")).toBe(
      "Contract reverted"
    );
    expect(closeDealErrorMessage(null)).toBe("Failed to close deal");
  });
});
