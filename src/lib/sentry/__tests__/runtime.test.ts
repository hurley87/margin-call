import { describe, expect, it } from "vitest";
import {
  filterLocalhostEvent,
  getSentryEnvironment,
  isLocalhostUrl,
  isSentryEnabled,
} from "@/lib/sentry/runtime";

describe("sentry runtime", () => {
  describe("isSentryEnabled", () => {
    it("enables Sentry for production deploys", () => {
      expect(isSentryEnabled("production", "production")).toBe(true);
    });

    it("disables Sentry in local development", () => {
      expect(isSentryEnabled("development", undefined)).toBe(false);
    });

    it("disables Sentry in preview deployments", () => {
      expect(isSentryEnabled("production", "preview")).toBe(false);
    });
  });

  describe("getSentryEnvironment", () => {
    it("uses production for vercel production deploys", () => {
      expect(getSentryEnvironment("production", "production")).toBe(
        "production",
      );
    });

    it("uses preview environment tag for vercel previews", () => {
      expect(getSentryEnvironment("production", "preview")).toBe(
        "vercel-preview",
      );
    });

    it("falls back to development tag", () => {
      expect(getSentryEnvironment("development", undefined)).toBe("development");
    });
  });

  describe("localhost filtering", () => {
    it("matches localhost and loopback URLs", () => {
      expect(isLocalhostUrl("http://localhost:4100/path")).toBe(true);
      expect(isLocalhostUrl("http://127.0.0.1:4100/path")).toBe(true);
      expect(isLocalhostUrl("http://[::1]:4100/path")).toBe(true);
      expect(isLocalhostUrl("http://desk.localhost:4100/path")).toBe(
        true,
      );
    });

    it("does not match non-localhost URLs", () => {
      expect(isLocalhostUrl("https://example.com/path")).toBe(false);
      expect(isLocalhostUrl("/path")).toBe(false);
    });

    it("drops localhost events in beforeSend filter", () => {
      const event = {
        request: {
          url: "http://localhost:4100/path",
        },
      };

      expect(filterLocalhostEvent(event)).toBeNull();
    });

    it("keeps non-localhost events in beforeSend filter", () => {
      const event = {
        request: {
          url: "https://example.com/path",
        },
      };

      expect(filterLocalhostEvent(event)).toEqual(event);
    });
  });
});
