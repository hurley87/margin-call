import { describe, expect, it } from "vitest";
import { getSentryEnvironment, shouldEnableSentry } from "@/lib/sentry/config";

describe("getSentryEnvironment", () => {
  it("uses SENTRY_ENVIRONMENT when defined", () => {
    expect(
      getSentryEnvironment({
        SENTRY_ENVIRONMENT: "staging",
        NEXT_PUBLIC_SENTRY_ENVIRONMENT: "preview",
        VERCEL_ENV: "production",
        NODE_ENV: "development",
      })
    ).toBe("staging");
  });

  it("falls back to NEXT_PUBLIC_SENTRY_ENVIRONMENT then VERCEL_ENV then NODE_ENV", () => {
    expect(
      getSentryEnvironment({
        NEXT_PUBLIC_SENTRY_ENVIRONMENT: "preview",
        VERCEL_ENV: "production",
        NODE_ENV: "development",
      })
    ).toBe("preview");

    expect(
      getSentryEnvironment({
        VERCEL_ENV: "production",
        NODE_ENV: "development",
      })
    ).toBe("production");

    expect(
      getSentryEnvironment({
        NODE_ENV: "test",
      })
    ).toBe("test");
  });
});

describe("shouldEnableSentry", () => {
  it("enables Sentry by default only in production", () => {
    expect(shouldEnableSentry({ NODE_ENV: "production" })).toBe(true);
    expect(shouldEnableSentry({ NODE_ENV: "development" })).toBe(false);
    expect(shouldEnableSentry({ NODE_ENV: "test" })).toBe(false);
  });

  it("supports explicit enable override", () => {
    expect(
      shouldEnableSentry({
        NODE_ENV: "development",
        SENTRY_ENABLED: "true",
      })
    ).toBe(true);

    expect(
      shouldEnableSentry({
        NODE_ENV: "development",
        NEXT_PUBLIC_SENTRY_ENABLED: "1",
      })
    ).toBe(true);
  });

  it("supports explicit disable override", () => {
    expect(
      shouldEnableSentry({
        NODE_ENV: "production",
        SENTRY_ENABLED: "false",
      })
    ).toBe(false);

    expect(
      shouldEnableSentry({
        NODE_ENV: "production",
        NEXT_PUBLIC_SENTRY_ENABLED: "0",
      })
    ).toBe(false);
  });

  it("ignores unrecognized override values and keeps default policy", () => {
    expect(
      shouldEnableSentry({
        NODE_ENV: "production",
        SENTRY_ENABLED: "maybe",
      })
    ).toBe(true);

    expect(
      shouldEnableSentry({
        NODE_ENV: "development",
        SENTRY_ENABLED: "maybe",
      })
    ).toBe(false);
  });
});
