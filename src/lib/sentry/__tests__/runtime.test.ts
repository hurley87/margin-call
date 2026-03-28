import {
  isSentryEnabled,
  resolveSentryEnvironment,
  shouldDropSentryEvent,
} from "@/lib/sentry/runtime";
import { describe, expect, it } from "vitest";

describe("isSentryEnabled", () => {
  it("returns true only in production", () => {
    expect(isSentryEnabled("production")).toBe(true);
    expect(isSentryEnabled("development")).toBe(false);
    expect(isSentryEnabled("test")).toBe(false);
    expect(isSentryEnabled(undefined)).toBe(false);
  });
});

describe("resolveSentryEnvironment", () => {
  it("returns production for production runtime", () => {
    expect(resolveSentryEnvironment("production")).toBe("production");
    expect(resolveSentryEnvironment("production", "vercel-preview")).toBe(
      "production",
    );
  });

  it("returns fallback environment when not production", () => {
    expect(resolveSentryEnvironment("development")).toBe("development");
    expect(resolveSentryEnvironment("development", "vercel-preview")).toBe(
      "vercel-preview",
    );
    expect(resolveSentryEnvironment(undefined, undefined)).toBe("development");
  });
});

describe("shouldDropSentryEvent", () => {
  it("drops localhost and loopback hosts", () => {
    expect(shouldDropSentryEvent("http://0.0.0.0:9876/wire")).toBe(true);
    expect(shouldDropSentryEvent("http://127.0.0.1:3000/")).toBe(true);
    expect(shouldDropSentryEvent("http://[::1]:3000/traders")).toBe(true);
  });

  it("keeps non-localhost URLs", () => {
    expect(shouldDropSentryEvent("https://margincall.app/wire")).toBe(false);
    expect(shouldDropSentryEvent("https://example.com")).toBe(false);
  });

  it("keeps empty and invalid URLs to avoid accidental drops", () => {
    expect(shouldDropSentryEvent(undefined)).toBe(false);
    expect(shouldDropSentryEvent(null)).toBe(false);
    expect(shouldDropSentryEvent("not-a-url")).toBe(false);
  });
});
