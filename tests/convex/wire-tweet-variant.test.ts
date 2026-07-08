import { describe, it, expect } from "vitest";
import {
  sanitizeTweet,
  containsUrl,
  TWEET_MAX_CHARS,
} from "../../convex/wire/tweetVariant";

describe("sanitizeTweet", () => {
  it("strips explicit URLs", () => {
    const res = sanitizeTweet(
      "KUPO ripped today https://margincall.fun/x $KUPO",
      {}
    );
    expect(res.text).not.toContain("http");
    expect(containsUrl(res.text)).toBe(false);
    expect(res.issues).toContain("stripped_url");
  });

  it("rejects a surviving bare domain rather than posting a mangled link", () => {
    const res = sanitizeTweet("Check margincall.fun for the tape", {});
    expect(res.ok).toBe(false);
    expect(res.issues).toContain("url");
  });

  it("appends the subject handle when missing and it fits", () => {
    const res = sanitizeTweet("SURPLUS up 38% for reasons nobody will say", {
      subjectHandle: "@AskSurplus",
    });
    expect(res.text).toContain("@AskSurplus");
    expect(res.ok).toBe(true);
  });

  it("strips an invented @-mention and keeps only the registry handle", () => {
    const res = sanitizeTweet("BASEMATE +46% @Basemate the interns cheered", {
      subjectHandle: "@basemateagent",
    });
    expect(res.text).not.toContain("@Basemate ");
    expect(res.text).not.toMatch(/@Basemate\b/);
    expect(res.text).toContain("@basemateagent");
    expect(res.issues).toContain("stripped_mention");
  });

  it("strips all @-mentions when there is no subject handle", () => {
    const res = sanitizeTweet("A quiet day, per @SomeGuy and @another", {});
    expect(res.text).not.toContain("@");
  });

  it("keeps an already-present handle without duplicating it", () => {
    const res = sanitizeTweet("SURPLUS up 38% @AskSurplus", {
      subjectHandle: "@AskSurplus",
    });
    expect(res.text.match(/@AskSurplus/g)?.length).toBe(1);
  });

  it("injects the subject cashtag when the model omitted it", () => {
    const res = sanitizeTweet("Basemate ripped 46% and the interns cheered", {
      subjectHandle: "@basemateagent",
      subjectSymbol: "BASEMATE",
    });
    expect(res.text).toContain("$BASEMATE");
    expect(res.text).toContain("@basemateagent");
    expect(res.issues).toContain("added_cashtag");
  });

  it("does not duplicate a cashtag the model already wrote", () => {
    const res = sanitizeTweet("$BASEMATE ripped 46%", {
      subjectSymbol: "BASEMATE",
    });
    expect(res.text.match(/\$BASEMATE/gi)?.length).toBe(1);
  });

  it("strips hashtags", () => {
    const res = sanitizeTweet("KUPO ripped 44% #KUPO #wallstreet", {
      subjectSymbol: "KUPO",
    });
    expect(res.text).not.toContain("#");
    expect(res.issues).toContain("stripped_hashtag");
    expect(res.text).toContain("$KUPO");
  });

  it("keeps the handle where the model wove it in, not appended at the end", () => {
    const res = sanitizeTweet(
      "@AskSurplus interns cheered $SURPLUS's 38% pop into the payphone",
      { subjectHandle: "@AskSurplus", subjectSymbol: "SURPLUS" }
    );
    expect(res.text.startsWith("@AskSurplus")).toBe(true);
    expect(res.text.endsWith("@AskSurplus")).toBe(false);
    expect(res.text.match(/@AskSurplus/g)?.length).toBe(1);
    expect(res.issues).not.toContain("added_cashtag");
  });

  it("preserves cashtags", () => {
    const res = sanitizeTweet("Quiet day for $KUPO and $NOOK", {});
    expect(res.text).toContain("$KUPO");
    expect(res.text).toContain("$NOOK");
  });

  it("truncates over-long tweets to the platform limit", () => {
    const long = "word ".repeat(100).trim();
    const res = sanitizeTweet(long, {});
    expect(res.text.length).toBeLessThanOrEqual(TWEET_MAX_CHARS);
    expect(res.issues).toContain("truncated");
  });
});
