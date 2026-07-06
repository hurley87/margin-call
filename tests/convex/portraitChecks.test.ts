import { describe, expect, it, vi } from "vitest";
import {
  BORDER_QUESTION,
  checkFlatBorder,
  checkTraitVisibility,
  RUBRIC,
  runPortraitAttempts,
  type Grader,
} from "../../convex/lib/portraitChecks";
import type { PublicPortraitTraits } from "../../convex/lib/portraitSeed";

const COMMON: PublicPortraitTraits = {
  expression: "cold",
  fieldInk: "vermilion",
  attire: "business",
  vice: "none",
  fieldFlourish: "plain",
};
// Vice "litcigar" is Rare → gated by the visibility check.
const RARE_VICE: PublicPortraitTraits = { ...COMMON, vice: "litcigar" };

// A clean grader: border is flat (present:false to "has glow") and any trait is visible.
const cleanGrader: Grader = async (_b, q) =>
  q === BORDER_QUESTION ? { present: false } : { present: true };

describe("portraitChecks — flat border", () => {
  it("passes when the border is affirmatively clean", async () => {
    expect(await checkFlatBorder(cleanGrader, "x")).toEqual({ ok: true });
  });
  it("fails when the grader affirmatively reports a bad border", async () => {
    const grader: Grader = async () => ({ present: true, note: "halo" });
    expect((await checkFlatBorder(grader, "x")).ok).toBe(false);
  });
  it("fails open on a grader infra-null", async () => {
    const grader: Grader = async () => ({ present: null });
    expect(await checkFlatBorder(grader, "x")).toEqual({ ok: true });
  });
});

describe("portraitChecks — trait visibility", () => {
  it("passes with no traits to verify", async () => {
    expect(await checkTraitVisibility(cleanGrader, "x", null)).toEqual({
      ok: true,
    });
  });
  it("does not gate common/uncommon traits even if the grader says absent", async () => {
    const grader: Grader = async () => ({ present: false });
    expect(await checkTraitVisibility(grader, "x", COMMON)).toEqual({
      ok: true,
    });
  });
  it("fails when a rare trait is affirmatively absent", async () => {
    const grader: Grader = async () => ({ present: false });
    const res = await checkTraitVisibility(grader, "x", RARE_VICE);
    expect(res.ok).toBe(false);
    expect(res.missing).toBe("litcigar");
  });
  it("passes when the rare trait is visible", async () => {
    expect(await checkTraitVisibility(cleanGrader, "x", RARE_VICE)).toEqual({
      ok: true,
    });
  });
  it("has a rubric entry for every checked rare/legendary id", () => {
    for (const id of [
      "manic",
      "silver",
      "goldleaf",
      "goldthread",
      "litcigar",
      "martini",
      "cigbouquet",
      "coupe",
      "tickerbold",
      "confetti",
    ]) {
      expect(RUBRIC[id]).toBeTruthy();
    }
  });
});

describe("portraitChecks — runPortraitAttempts", () => {
  it("returns ready on the first clean attempt", async () => {
    const generate = vi.fn(async () => "img");
    const out = await runPortraitAttempts({
      generate,
      grader: cleanGrader,
      traits: COMMON,
    });
    expect(out).toEqual({ status: "ready", base64: "img" });
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it("regenerates after a border failure, then succeeds", async () => {
    let n = 0;
    const generate = vi.fn(async () => `img-${++n}`);
    const grader: Grader = async (b, q) =>
      q === BORDER_QUESTION ? { present: b === "img-1" } : { present: true };
    const out = await runPortraitAttempts({ generate, grader, traits: COMMON });
    expect(out).toEqual({ status: "ready", base64: "img-2" });
    expect(generate).toHaveBeenCalledTimes(2);
  });

  it("errors with failed_border_check after exhausting attempts", async () => {
    const generate = vi.fn(async () => "bad");
    const grader: Grader = async () => ({ present: true });
    const out = await runPortraitAttempts({
      generate,
      grader,
      traits: COMMON,
      maxAttempts: 3,
    });
    expect(out).toEqual({ status: "error", reason: "failed_border_check" });
    expect(generate).toHaveBeenCalledTimes(3);
  });

  it("errors with failed_trait_visibility when a rare trait never appears", async () => {
    const grader: Grader = async (_b, q) =>
      q === BORDER_QUESTION ? { present: false } : { present: false };
    const out = await runPortraitAttempts({
      generate: async () => "x",
      grader,
      traits: RARE_VICE,
      maxAttempts: 2,
    });
    expect(out).toEqual({ status: "error", reason: "failed_trait_visibility" });
  });

  it("fails open: a grader outage never blocks the tile", async () => {
    const grader: Grader = async () => ({ present: null });
    const out = await runPortraitAttempts({
      generate: async () => "y",
      grader,
      traits: RARE_VICE,
    });
    expect(out).toEqual({ status: "ready", base64: "y" });
  });

  it("surfaces a generation_error reason when generation keeps throwing", async () => {
    const generate = vi.fn(async () => {
      throw new Error("boom");
    });
    const out = await runPortraitAttempts({
      generate,
      grader: cleanGrader,
      traits: COMMON,
      maxAttempts: 2,
    });
    expect(out.status).toBe("error");
    if (out.status === "error")
      expect(out.reason).toContain("generation_error");
    expect(generate).toHaveBeenCalledTimes(2);
  });
});
