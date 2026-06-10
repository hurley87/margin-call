import { describe, expect, it } from "vitest";
import {
  easeOutCubic,
  retargetTween,
  sampleTween,
  visibleChangeDirection,
} from "@/lib/animated-number";
import { formatMoney } from "@/lib/utils";

describe("easeOutCubic", () => {
  it("clamps to [0, 1]", () => {
    expect(easeOutCubic(-1)).toBe(0);
    expect(easeOutCubic(0)).toBe(0);
    expect(easeOutCubic(1)).toBe(1);
    expect(easeOutCubic(2)).toBe(1);
  });

  it("decelerates toward the end", () => {
    const firstHalf = easeOutCubic(0.5) - easeOutCubic(0);
    const secondHalf = easeOutCubic(1) - easeOutCubic(0.5);
    expect(firstHalf).toBeGreaterThan(secondHalf);
  });
});

describe("sampleTween", () => {
  const tween = { from: 100, to: 200, startedAt: 1000, durationMs: 400 };

  it("starts at from", () => {
    expect(sampleTween(tween, 1000)).toEqual({ value: 100, done: false });
  });

  it("lands exactly on to when complete", () => {
    expect(sampleTween(tween, 1400)).toEqual({ value: 200, done: true });
    expect(sampleTween(tween, 9999)).toEqual({ value: 200, done: true });
  });

  it("moves monotonically between endpoints", () => {
    const mid = sampleTween(tween, 1200).value;
    expect(mid).toBeGreaterThan(100);
    expect(mid).toBeLessThan(200);
  });
});

describe("retargetTween", () => {
  it("starts at the next value when there is no current tween", () => {
    const tween = retargetTween(null, 1000, 500, 400);
    expect(tween.from).toBe(500);
    expect(tween.to).toBe(500);
  });

  it("continues from the current eased position mid-flight", () => {
    const current = { from: 0, to: 100, startedAt: 1000, durationMs: 400 };
    const next = retargetTween(current, 1200, 50, 400);
    expect(next.from).toBeGreaterThan(0);
    expect(next.from).toBeLessThan(100);
    expect(next.to).toBe(50);
    expect(next.startedAt).toBe(1200);
  });

  it("converges under rapid successive retargets instead of queueing", () => {
    let tween = retargetTween(null, 0, 0, 400);
    tween = retargetTween(tween, 50, 100, 400);
    tween = retargetTween(tween, 100, 200, 400);
    expect(tween.to).toBe(200);
    expect(sampleTween(tween, 500)).toEqual({ value: 200, done: true });
  });
});

describe("visibleChangeDirection", () => {
  it("returns direction for visible changes", () => {
    expect(visibleChangeDirection(100, 150, formatMoney)).toBe("up");
    expect(visibleChangeDirection(150, 100, formatMoney)).toBe("down");
  });

  it("returns null when the formatted output is unchanged", () => {
    // formatMoney renders >= $1000 with 0 decimals, so sub-dollar drift hides
    expect(visibleChangeDirection(5000.1, 5000.4, formatMoney)).toBeNull();
    expect(visibleChangeDirection(42, 42, formatMoney)).toBeNull();
  });
});
