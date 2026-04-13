import { describe, expect, it } from "vitest";
import {
  beforeSendFilter,
  isLocalUrl,
  isSentryEnabled,
  resolveSentryEnvironment,
} from "@/lib/sentry/event-filter";

describe("event-filter", () => {
  describe("resolveSentryEnvironment", () => {
    it("uses VERCEL_ENV when present", () => {
      expect(resolveSentryEnvironment("development", "preview")).toBe("preview");
    });

    it("falls back to NODE_ENV", () => {
      expect(resolveSentryEnvironment("production", undefined)).toBe("production");
    });

    it("defaults to development when no environment values are provided", () => {
      expect(resolveSentryEnvironment("", "")).toBe("development");
    });
  });

  describe("isSentryEnabled", () => {
    it("enables production environments", () => {
      expect(isSentryEnabled("production")).toBe(true);
      expect(isSentryEnabled("vercel-production")).toBe(true);
    });

    it("disables non-production environments", () => {
      expect(isSentryEnabled("preview")).toBe(false);
      expect(isSentryEnabled("development")).toBe(false);
    });
  });

  describe("isLocalUrl", () => {
    it("detects localhost and loopback variants", () => {
      expect(isLocalUrl("http://127.0.0.1:3000")).toBe(true);
      expect(isLocalUrl("http://0.0.0.0:3000")).toBe(true);
      expect(isLocalUrl("http://[::1]:3000")).toBe(true);
    });

    it("does not treat remote hosts as local", () => {
      expect(isLocalUrl("https://margincall.gg/play")).toBe(false);
    });

    it("ignores invalid URLs", () => {
      expect(isLocalUrl("/relative/path")).toBe(false);
      expect(isLocalUrl("not-a-valid-url")).toBe(false);
    });
  });

  describe("beforeSendFilter", () => {
    it("drops all events in non-production environments", () => {
      const event = { request: { url: "https://margincall.gg/play" } };
      expect(beforeSendFilter(event, "development")).toBeNull();
      expect(beforeSendFilter(event, "preview")).toBeNull();
    });

    it("drops localhost events in production", () => {
      const event = { request: { url: "http://127.0.0.1:3000/trader" } };
      expect(beforeSendFilter(event, "production")).toBeNull();
    });

    it("keeps production events with non-localhost URLs", () => {
      const event = { request: { url: "https://margincall.gg/trader" } };
      expect(beforeSendFilter(event, "production")).toEqual(event);
      expect(beforeSendFilter(event, "vercel-production")).toEqual(event);
    });

    it("keeps production events without request URLs", () => {
      const event = { message: "Background worker failure" };
      expect(beforeSendFilter(event, "production")).toEqual(event);
    });
  });
});
