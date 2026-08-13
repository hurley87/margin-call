import { describe, expect, it } from "vitest";
import { entrySubmitLabel } from "./entry-submit-label";

describe("entrySubmitLabel", () => {
  it("maps in-flight and idle entry statuses", () => {
    expect(entrySubmitLabel("approval-submitting", true)).toBe(
      "Approval pending…"
    );
    expect(entrySubmitLabel("entry-pending", false)).toBe("Entering…");
    expect(entrySubmitLabel("ready", true)).toBe("Approve & enter");
    expect(entrySubmitLabel("ready", false)).toBe("Enter round");
  });
});
