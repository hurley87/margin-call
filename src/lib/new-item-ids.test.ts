import { describe, expect, it } from "vitest";
import { collectNewIds } from "@/lib/new-item-ids";

describe("collectNewIds", () => {
  it("returns nothing when every id is already seen", () => {
    const seen = new Set(["a", "b", "c"]);
    const { fresh } = collectNewIds(seen, ["a", "b", "c"]);
    expect(fresh.size).toBe(0);
  });

  it("assigns burst indexes in list order (newest first)", () => {
    const seen = new Set(["c", "d"]);
    const { fresh } = collectNewIds(seen, ["a", "b", "c", "d"]);
    expect(fresh.get("a")).toBe(0);
    expect(fresh.get("b")).toBe(1);
    expect(fresh.has("c")).toBe(false);
  });

  it("marks all new ids as seen for the next diff", () => {
    const first = collectNewIds(new Set(), ["a", "b"]);
    expect(first.fresh.size).toBe(2);
    const second = collectNewIds(first.seen, ["x", "a", "b"]);
    expect([...second.fresh.keys()]).toEqual(["x"]);
    expect(second.fresh.get("x")).toBe(0);
  });

  it("does not mutate the input seen set", () => {
    const seen = new Set(["a"]);
    collectNewIds(seen, ["a", "b"]);
    expect(seen.has("b")).toBe(false);
  });
});
