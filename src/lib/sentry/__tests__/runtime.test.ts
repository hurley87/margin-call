import { describe, expect, it } from "vitest";
import {
  isSentryEnabled,
  resolveSentryEnvironment,
  shouldDropSentryEvent,
} from "@/lib/sentry/runtime";

describe("isSentryEnabled", () => {
  const DSN = "https://examplePublicKey@o0.ingest.sentry.io/0";

  it("returns false when DSN is missing", () => {
    expect(
      isSentryEnabled({
        dsn: "",
        nodeEnv: "production",
        vercelEnv: "production",
      }),
    ).toBe(false);
  });

  it("returns false for non-production node environment", () => {
    expect(
      isSentryEnabled({
        dsn: DSN,
        nodeEnv: "development",
        vercelEnv: "production",
      }),
    ).toBe(false);
  });

  it("returns false for Vercel preview deployments", () => {
    expect(
      isSentryEnabled({
        dsn: DSN,
        nodeEnv: "production",
        vercelEnv: "preview",
      }),
    ).toBe(false);
  });

  it("returns true for production runtime when Vercel env is absent", () => {
    expect(
      isSentryEnabled({
        dsn: DSN,
        nodeEnv: "production",
        vercelEnv: undefined,
      }),
    ).toBe(true);
  });
});

describe("resolveSentryEnvironment", () => {
  it("uses explicit fallback in production", () => {
    expect(resolveSentryEnvironment("production", "vercel-production")).toBe(
      "vercel-production",
    );
  });

  it("falls back to production in production runtime", () => {
    expect(resolveSentryEnvironment("production", "")).toBe("production");
  });

  it("uses normalized node env outside production", () => {
    expect(resolveSentryEnvironment("development", "live")).toBe("development");
    expect(resolveSentryEnvironment("test", "anything")).toBe("test");
  });
});

describe("shouldDropSentryEvent", () => {
  it("drops non-production environment events", () => {
    expect(
      shouldDropSentryEvent({
        environment: "development",
      }),
    ).toBe(true);

    expect(
      shouldDropSentryEvent({
        environment: "preview",
      }),
    ).toBe(true);
  });

  it("drops localhost and loopback request URLs", () => {
    expect(
      shouldDropSentryEvent({
        request: { url: "http://127.0.0.1:3000/dashboard" },
      }),
    ).toBe(true);

    expect(
      shouldDropSentryEvent({
        request: { url: "http://[::1]:3000/dashboard" },
      }),
    ).toBe(true);
  });

  it("drops localhost URLs in tags and transactions", () => {
    expect(
      shouldDropSentryEvent({
        tags: { url: "http://127.0.0.1:3000/wire" },
      }),
    ).toBe(true);

    expect(
      shouldDropSentryEvent({
        transaction: "127.0.0.1:3000/no-protocol",
      }),
    ).toBe(true);
  });

  it("keeps production remote events", () => {
    expect(
      shouldDropSentryEvent({
        environment: "production",
        request: { url: "https://margincall.example/traders/123" },
        tags: { url: "https://margincall.example/traders/123" },
        transaction: "/traders/:id",
      }),
    ).toBe(false);
  });
});
