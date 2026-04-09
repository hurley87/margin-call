import { describe, expect, it } from "vitest";
import {
  getSentryEnvironment,
  isSentryEnabled,
  shouldDropSentryEvent,
} from "@/lib/sentry/event-filter";

describe("getSentryEnvironment", () => {
  it("prefers explicit SENTRY_ENVIRONMENT", () => {
    expect(
      getSentryEnvironment({
        SENTRY_ENVIRONMENT: "production",
        NEXT_PUBLIC_SENTRY_ENVIRONMENT: "preview",
        VERCEL_ENV: "development",
        NODE_ENV: "development",
      })
    ).toBe("production");
  });

  it("falls back to NEXT_PUBLIC_SENTRY_ENVIRONMENT then VERCEL_ENV then NODE_ENV", () => {
    expect(
      getSentryEnvironment({
        NEXT_PUBLIC_SENTRY_ENVIRONMENT: "preview",
        VERCEL_ENV: "development",
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
        NODE_ENV: "development",
      })
    ).toBe("development");
  });
});

describe("isSentryEnabled", () => {
  it("enables only for production with a DSN", () => {
    expect(
      isSentryEnabled({
        NEXT_PUBLIC_SENTRY_DSN: "https://examplePublicKey@o0.ingest.sentry.io/0",
        NODE_ENV: "production",
      })
    ).toBe(true);

    expect(
      isSentryEnabled({
        NEXT_PUBLIC_SENTRY_DSN: "https://examplePublicKey@o0.ingest.sentry.io/0",
        NODE_ENV: "development",
      })
    ).toBe(false);

    expect(
      isSentryEnabled({
        NODE_ENV: "production",
      })
    ).toBe(false);
  });
});

describe("shouldDropSentryEvent", () => {
  const productionEnv = {
    NEXT_PUBLIC_SENTRY_DSN: "https://examplePublicKey@o0.ingest.sentry.io/0",
    NODE_ENV: "production",
  };

  it("keeps production events from non-local URLs", () => {
    expect(
      shouldDropSentryEvent(
        {
          request: { url: "https://margincallgame.com/traders/123" },
          tags: { environment: "production" },
        },
        productionEnv
      )
    ).toBe(false);
  });

  it("drops non-production events", () => {
    expect(
      shouldDropSentryEvent(
        {
          request: { url: "https://margincallgame.com/traders/123" },
          tags: { environment: "development" },
        },
        productionEnv
      )
    ).toBe(true);
  });

  it("drops localhost events even if runtime is production", () => {
    expect(
      shouldDropSentryEvent(
        {
          request: { url: "http://127.0.0.1:3901/traders/123" },
          tags: { environment: "production" },
        },
        productionEnv
      )
    ).toBe(true);
  });

  it("drops all events when sentry is disabled", () => {
    expect(
      shouldDropSentryEvent(
        {
          request: { url: "https://margincallgame.com/traders/123" },
          tags: { environment: "production" },
        },
        { NODE_ENV: "development" }
      )
    ).toBe(true);
  });
});
