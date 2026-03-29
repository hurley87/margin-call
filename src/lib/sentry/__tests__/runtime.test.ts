import { describe, expect, it } from "vitest";
import {
  isSentryEnabled,
  resolveSentryEnvironment,
  shouldDropSentryEvent,
} from "@/lib/sentry/runtime";

describe("sentry runtime helpers", () => {
  describe("isSentryEnabled", () => {
    it("enables sentry only in production", () => {
      expect(isSentryEnabled("production")).toBe(true);
      expect(isSentryEnabled("development")).toBe(false);
      expect(isSentryEnabled("test")).toBe(false);
      expect(isSentryEnabled(undefined)).toBe(false);
    });
  });

  describe("resolveSentryEnvironment", () => {
    it("uses explicit production environment when provided", () => {
      expect(resolveSentryEnvironment("production", "vercel-production")).toBe(
        "vercel-production"
      );
    });

    it("falls back to production in production runtime", () => {
      expect(resolveSentryEnvironment("production", "")).toBe("production");
      expect(resolveSentryEnvironment("production", undefined)).toBe(
        "production"
      );
    });

    it("normalizes test and development environments", () => {
      expect(resolveSentryEnvironment("test", "ignored")).toBe("test");
      expect(resolveSentryEnvironment("development", "ignored")).toBe(
        "development"
      );
      expect(resolveSentryEnvironment(undefined, "ignored")).toBe(
        "development"
      );
    });
  });

  describe("shouldDropSentryEvent", () => {
    it("drops localhost and loopback URLs", () => {
      expect(shouldDropSentryEvent("http://localhost:43110/foo")).toBe(true);
      expect(shouldDropSentryEvent("https://127.0.0.1/api")).toBe(true);
      expect(shouldDropSentryEvent("http://0.0.0.0:3000")).toBe(true);
      expect(shouldDropSentryEvent("http://[::1]:3000")).toBe(true);
      expect(shouldDropSentryEvent("https://app.localhost/path")).toBe(true);
      expect(shouldDropSentryEvent("https://desktop.local/path")).toBe(true);
    });

    it("keeps valid non-localhost URLs", () => {
      expect(shouldDropSentryEvent("https://example.com/monitoring")).toBe(
        false
      );
    });

    it("handles missing or invalid URLs safely", () => {
      expect(shouldDropSentryEvent(undefined)).toBe(false);
      expect(shouldDropSentryEvent("not-a-url")).toBe(false);
    });
  });
});
