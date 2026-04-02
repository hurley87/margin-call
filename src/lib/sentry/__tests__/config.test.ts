import { describe, expect, it } from "vitest";
import { getSentryEnvironment, shouldEnableSentry } from "@/lib/sentry/config";

describe("sentry config environment guards", () => {
  it("prefers vercel production environment", () => {
    expect(
      getSentryEnvironment({ NODE_ENV: "development", VERCEL_ENV: "production" })
    ).toBe("production");
    expect(
      shouldEnableSentry({ NODE_ENV: "development", VERCEL_ENV: "production" })
    ).toBe(true);
  });

  it("treats preview as non-production", () => {
    expect(
      getSentryEnvironment({ NODE_ENV: "production", VERCEL_ENV: "preview" })
    ).toBe("preview");
    expect(
      shouldEnableSentry({ NODE_ENV: "production", VERCEL_ENV: "preview" })
    ).toBe(false);
  });

  it("falls back to node env when vercel env is unavailable", () => {
    expect(getSentryEnvironment({ NODE_ENV: "production" })).toBe("production");
    expect(shouldEnableSentry({ NODE_ENV: "production" })).toBe(true);
  });

  it("defaults unknown values to development", () => {
    expect(
      getSentryEnvironment({ NODE_ENV: "staging", VERCEL_ENV: "qa" })
    ).toBe("development");
    expect(shouldEnableSentry({ NODE_ENV: "staging", VERCEL_ENV: "qa" })).toBe(
      false
    );
  });
});
