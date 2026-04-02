import { describe, expect, it } from "vitest";
import {
  isLocalhostUrl,
  isSentryEnabled,
  resolveSentryEnvironment,
  shouldDropClientEvent,
} from "@/lib/sentry/runtime";

describe("resolveSentryEnvironment", () => {
  it("prefers explicit Sentry environment values", () => {
    expect(
      resolveSentryEnvironment({
        NEXT_PUBLIC_SENTRY_ENV: "production",
        NODE_ENV: "development",
      })
    ).toBe("production");

    expect(
      resolveSentryEnvironment({
        SENTRY_ENVIRONMENT: "staging",
        NODE_ENV: "production",
      })
    ).toBe("staging");
  });

  it("falls back to Vercel and node environment", () => {
    expect(resolveSentryEnvironment({ VERCEL_ENV: "preview" })).toBe("preview");
    expect(resolveSentryEnvironment({ NODE_ENV: "production" })).toBe(
      "production"
    );
    expect(resolveSentryEnvironment({})).toBe("development");
  });
});

describe("isSentryEnabled", () => {
  it("enables only when DSN exists in production", () => {
    expect(
      isSentryEnabled({
        NEXT_PUBLIC_SENTRY_DSN: "https://public@example.ingest.sentry.io/1",
        NODE_ENV: "production",
      })
    ).toBe(true);

    expect(
      isSentryEnabled({
        NEXT_PUBLIC_SENTRY_DSN: "https://public@example.ingest.sentry.io/1",
        NODE_ENV: "development",
      })
    ).toBe(false);

    expect(isSentryEnabled({ NODE_ENV: "production" })).toBe(false);
  });
});

describe("localhost client-event filtering", () => {
  it("detects localhost hosts", () => {
    const localWireUrl = `http://${"localhost"}:3000/wire`;
    expect(isLocalhostUrl(localWireUrl)).toBe(true);
    expect(isLocalhostUrl("http://127.0.0.1:3000")).toBe(true);
    expect(isLocalhostUrl("https://example.org/wire")).toBe(false);
    expect(isLocalhostUrl("not-a-url")).toBe(false);
  });

  it("drops events when request URL is local", () => {
    const localTraderUrl = `http://${"localhost"}:3000/traders/1`;
    expect(
      shouldDropClientEvent({
        request: {
          url: localTraderUrl,
        },
      })
    ).toBe(true);
  });

  it("drops events when only tags contain localhost URL", () => {
    expect(
      shouldDropClientEvent({
        tags: {
          url: "http://127.0.0.1:3000/",
        },
      })
    ).toBe(true);
  });

  it("keeps events with non-local or missing URLs", () => {
    expect(
      shouldDropClientEvent({
        request: {
          url: "https://example.org/traders/1",
        },
      })
    ).toBe(false);
    expect(shouldDropClientEvent({})).toBe(false);
  });
});
