import { describe, expect, it } from "vitest";
import {
  getSentryEnvironment,
  isLocalUrl,
  isSentryEnabled,
} from "@/lib/sentry/runtime";

describe("isSentryEnabled", () => {
  it("returns false when DSN is missing", () => {
    expect(
      isSentryEnabled({
        nodeEnv: "production",
        vercelEnv: "production",
        sentryDsn: "",
      })
    ).toBe(false);
  });

  it("requires production Vercel runtime when VERCEL_ENV is set", () => {
    expect(
      isSentryEnabled({
        nodeEnv: "production",
        vercelEnv: "preview",
        sentryDsn: "test-dsn",
      })
    ).toBe(false);
    expect(
      isSentryEnabled({
        nodeEnv: "development",
        vercelEnv: "production",
        sentryDsn: "test-dsn",
      })
    ).toBe(true);
  });

  it("falls back to NODE_ENV outside Vercel", () => {
    expect(
      isSentryEnabled({
        nodeEnv: "production",
        vercelEnv: undefined,
        sentryDsn: "test-dsn",
      })
    ).toBe(true);
    expect(
      isSentryEnabled({
        nodeEnv: "development",
        vercelEnv: undefined,
        sentryDsn: "test-dsn",
      })
    ).toBe(false);
  });
});

describe("getSentryEnvironment", () => {
  it("prefers VERCEL_ENV when present", () => {
    expect(
      getSentryEnvironment({
        nodeEnv: "production",
        vercelEnv: "preview",
      })
    ).toBe("preview");
  });

  it("falls back to NODE_ENV and then development", () => {
    expect(
      getSentryEnvironment({
        nodeEnv: "production",
        vercelEnv: undefined,
      })
    ).toBe("production");
    expect(
      getSentryEnvironment({
        nodeEnv: undefined,
        vercelEnv: undefined,
      })
    ).toBe("development");
  });
});

describe("isLocalUrl", () => {
  it("detects localhost and loopback hosts", () => {
    expect(isLocalUrl("http://localhost:3999/traders/1")).toBe(true);
    expect(isLocalUrl("http://127.0.0.1:3999")).toBe(true);
    expect(isLocalUrl("http://0.0.0.0:3999")).toBe(true);
    expect(isLocalUrl("http://[::1]:3999")).toBe(true);
  });

  it("returns false for non-local urls and invalid values", () => {
    expect(isLocalUrl("https://example.invalid")).toBe(false);
    expect(isLocalUrl("")).toBe(false);
    expect(isLocalUrl("not-a-url")).toBe(false);
    expect(isLocalUrl(undefined)).toBe(false);
  });
});
