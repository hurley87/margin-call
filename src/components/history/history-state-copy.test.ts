import { describe, expect, it } from "vitest";
import { historyRowLabel, historyStateCopy } from "./history-state-copy";

describe("historyRowLabel", () => {
  it("returns attested crash point for finalized rounds", () => {
    expect(historyRowLabel("finalized", "3.42x")).toBe("3.42x");
    expect(historyRowLabel("finalized", null)).toBe("—");
  });

  it("uses canonical copy for every non-crash-point state", () => {
    expect(historyRowLabel("open", null)).toBe(historyStateCopy.open.rowLabel);
    expect(historyRowLabel("delayed", null)).toBe(
      historyStateCopy.delayed.rowLabel
    );
    expect(historyRowLabel("empty", null)).toBe(
      historyStateCopy.empty.rowLabel
    );
    expect(historyRowLabel("expired", null)).toBe(
      historyStateCopy.expired.rowLabel
    );
  });
});
