import { describe, expect, it } from "vitest";
import {
  shouldDropLocalSentryEvent,
  shouldEnableSentryRuntime,
} from "@/lib/sentry/runtime";

describe("shouldEnableSentryRuntime", () => {
  it("returns false when DSN is missing", () => {
    expect(
      shouldEnableSentryRuntime({
        dsn: "",
        nodeEnv: "production",
        vercelEnv: "production",
      })
    ).toBe(false);
  });

  it("returns false outside production node environment", () => {
    expect(
      shouldEnableSentryRuntime({
        dsn: "https://examplePublicKey@o0.ingest.sentry.io/0",
        nodeEnv: "development",
        vercelEnv: "production",
      })
    ).toBe(false);
  });

  it("returns false for Vercel preview deployments", () => {
    expect(
      shouldEnableSentryRuntime({
        dsn: "https://examplePublicKey@o0.ingest.sentry.io/0",
        nodeEnv: "production",
        vercelEnv: "preview",
      })
    ).toBe(false);
  });

  it("returns true for production runtime when Vercel env is absent", () => {
    expect(
      shouldEnableSentryRuntime({
        dsn: "https://examplePublicKey@o0.ingest.sentry.io/0",
        nodeEnv: "production",
        vercelEnv: undefined,
      })
    ).toBe(true);
  });

  it("returns true for Vercel production deployments", () => {
    expect(
      shouldEnableSentryRuntime({
        dsn: "https://examplePublicKey@o0.ingest.sentry.io/0",
        nodeEnv: "production",
        vercelEnv: "production",
      })
    ).toBe(true);
  });
});

describe("shouldDropLocalSentryEvent", () => {
  it("drops development environment events", () => {
    expect(
      shouldDropLocalSentryEvent({
        environment: "development",
      })
    ).toBe(true);
  });

  it("drops localhost request URLs", () => {
    expect(
      shouldDropLocalSentryEvent({
        request: { url: "http://0.0.0.0:8080/traders/123" },
      })
    ).toBe(true);
  });

  it("drops localhost URL tags", () => {
    expect(
      shouldDropLocalSentryEvent({
        tags: { url: "http://127.0.0.1:3000/wire" },
      })
    ).toBe(true);
  });

  it("keeps production remote events", () => {
    expect(
      shouldDropLocalSentryEvent({
        environment: "production",
        request: { url: "https://example.com/traders/123" },
        tags: { url: "https://example.com/traders/123" },
        transaction: "/traders/:id",
      })
    ).toBe(false);
  });
});
