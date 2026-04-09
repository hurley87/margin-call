import { describe, expect, it } from "vitest";
import {
  isSentryEnabled,
  resolveSentryEnvironment,
  shouldDropSentryEvent,
} from "@/lib/sentry/runtime";

describe("isSentryEnabled", () => {
  it("returns true only for production", () => {
    expect(isSentryEnabled("production")).toBe(true);
    expect(isSentryEnabled("development")).toBe(false);
    expect(isSentryEnabled("test")).toBe(false);
    expect(isSentryEnabled(undefined)).toBe(false);
  });
});

describe("resolveSentryEnvironment", () => {
  it("uses explicit environment in production", () => {
    expect(resolveSentryEnvironment("production", "live")).toBe("live");
  });

  it("falls back to production in production runtime", () => {
    expect(resolveSentryEnvironment("production", "")).toBe("production");
  });

  it("uses NODE_ENV outside production", () => {
    expect(resolveSentryEnvironment("development", "live")).toBe("development");
    expect(resolveSentryEnvironment("test", "anything")).toBe("test");
  });
});

describe("shouldDropSentryEvent", () => {
  it("does not drop events without URL", () => {
    expect(shouldDropSentryEvent(undefined)).toBe(false);
    expect(shouldDropSentryEvent(null)).toBe(false);
  });

  it("drops localhost and loopback URLs", () => {
    expect(shouldDropSentryEvent("http://127.0.0.1:3000/dashboard")).toBe(
      true,
    );
    expect(shouldDropSentryEvent("http://[::1]:3000/dashboard")).toBe(true);
    expect(shouldDropSentryEvent("http://0.0.0.0:3000/dashboard")).toBe(true);
    expect(shouldDropSentryEvent("https://agent.local/api")).toBe(true);
  });

  it("keeps non-localhost URLs", () => {
    expect(
      shouldDropSentryEvent("https://public-preview-domain.example/dashboard"),
    ).toBe(false);
    expect(shouldDropSentryEvent("https://trading-prod.example/deals")).toBe(
      false,
    );
  });

  it("falls back to regex matching for malformed URLs", () => {
    expect(shouldDropSentryEvent("127.0.0.1:3000/no-protocol")).toBe(true);
    expect(shouldDropSentryEvent("notaurl")).toBe(false);
  });
});
