import { describe, it, expect } from "vitest";
import { sanitizeTweet } from "../../convex/wire/tweetVariant";
import {
  buildDealTweetText,
  formatDealTweetMoney,
  resolveSubjectFromNarrative,
} from "../../convex/wire/dealTweetText";
import { tokenBySlug } from "../../convex/wire/tokenRegistry";

describe("formatDealTweetMoney", () => {
  it("formats whole dollars without decimals", () => {
    expect(formatDealTweetMoney(50)).toBe("$50");
    expect(formatDealTweetMoney(5)).toBe("$5");
  });

  it("keeps cents when present", () => {
    expect(formatDealTweetMoney(5.5)).toBe("$5.50");
  });

  it("uses locale separators for large amounts", () => {
    expect(formatDealTweetMoney(1500)).toBe("$1,500");
  });
});

describe("resolveSubjectFromNarrative", () => {
  it("resolves from worldState.leadTokenSlug", () => {
    const kupo = tokenBySlug("kupo");
    expect(kupo).toBeDefined();
    const res = resolveSubjectFromNarrative({
      worldState: { leadTokenSlug: "kupo" },
    });
    expect(res.subjectSymbol).toBe("KUPO");
    expect(res.subjectHandle).toBe(kupo!.xHandle);
  });

  it("falls back to tweetSubjectHandle", () => {
    const res = resolveSubjectFromNarrative({
      worldState: { leadTokenSlug: null },
      tweetSubjectHandle: "@AskSurplus",
    });
    expect(res.subjectSymbol).toBe("SURPLUS");
    expect(res.subjectHandle).toBe("@AskSurplus");
  });

  it("falls back to first sourceTrace tokenSignal", () => {
    const res = resolveSubjectFromNarrative({
      worldState: {},
      sourceTrace: {
        tokenSignals: [{ symbol: "LFI", slug: "lfi" }],
      },
    });
    expect(res.subjectSymbol).toBe("LFI");
    expect(res.subjectHandle).toBe("@lienfiapp");
  });

  it("returns nulls when no company subject", () => {
    const res = resolveSubjectFromNarrative({
      worldState: { leadTokenSlug: null },
      sourceTrace: { tokenSignals: [] },
    });
    expect(res.subjectSymbol).toBeNull();
    expect(res.subjectHandle).toBeNull();
  });
});

describe("buildDealTweetText", () => {
  it("builds the floor-voice template with pot and entry", () => {
    const text = buildDealTweetText({
      prompt: "Kupo interns short the coffee futures",
      potUsdc: 50,
      entryCostUsdc: 5,
    });
    expect(text).toBe(
      'NEW DEAL HIT THE FLOOR — "Kupo interns short the coffee futures". Pot $50 / entry $5.'
    );
  });

  it("truncates a long prompt so sanitize can append $SYMBOL", () => {
    const longPrompt = "word ".repeat(80).trim();
    const raw = buildDealTweetText({
      prompt: longPrompt,
      potUsdc: 100,
      entryCostUsdc: 10,
      reserveChars: 32,
    });
    const sanitized = sanitizeTweet(raw, {
      subjectSymbol: "KUPO",
      subjectHandle: "@kupo_gg",
    });
    expect(sanitized.ok).toBe(true);
    expect(sanitized.text).toContain("$KUPO");
    expect(sanitized.text.length).toBeLessThanOrEqual(280);
  });

  it("sanitize appends cashtag when the template omits it", () => {
    const raw = buildDealTweetText({
      prompt: "Kupo interns short the coffee futures",
      potUsdc: 50,
      entryCostUsdc: 5,
    });
    const sanitized = sanitizeTweet(raw, {
      subjectSymbol: "KUPO",
      subjectHandle: "@kupo_gg",
    });
    expect(sanitized.text).toContain("$KUPO");
    expect(sanitized.text).toContain("@kupo_gg");
    expect(sanitized.issues).toContain("added_cashtag");
  });
});
