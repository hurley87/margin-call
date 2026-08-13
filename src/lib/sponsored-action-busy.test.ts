import { describe, expect, it } from "vitest";
import { isSponsoredActionBusy } from "./sponsored-action-busy";

describe("isSponsoredActionBusy", () => {
  it("matches mid-flight settlement and history statuses", () => {
    expect(isSponsoredActionBusy("claim-submitting")).toBe(true);
    expect(isSponsoredActionBusy("reveal-pending")).toBe(true);
    expect(isSponsoredActionBusy("attesting")).toBe(true);
    expect(isSponsoredActionBusy("ready")).toBe(false);
    expect(isSponsoredActionBusy("confirmed")).toBe(false);
    expect(isSponsoredActionBusy("error")).toBe(false);
  });
});
