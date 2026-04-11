import { describe, expect, it } from "vitest";
import {
  beforeSendFilter,
  isLocalUrl,
  isSentryEnabled,
  resolveSentryEnvironment,
} from "@/lib/sentry/event-filter";

describe("resolveSentryEnvironment", () => {
  it("returns development when NODE_ENV is not production", () => {
    expect(resolveSentryEnvironment("development", undefined)).toBe(
      "development"
    );
  });

  it("returns vercel-production for Vercel production deployments", () => {
    expect(resolveSentryEnvironment("production", "production")).toBe(
      "vercel-production"
    );
  });

  it("returns vercel-preview for Vercel preview deployments", () => {
    expect(resolveSentryEnvironment("production", "preview")).toBe(
      "vercel-preview"
    );
  });

  it("falls back to production for non-Vercel production", () => {
    expect(resolveSentryEnvironment("production", undefined)).toBe(
      "production"
    );
  });
});

describe("isSentryEnabled", () => {
  it("enables Sentry in production environments only", () => {
    expect(isSentryEnabled("production")).toBe(true);
    expect(isSentryEnabled("vercel-production")).toBe(true);
    expect(isSentryEnabled("development")).toBe(false);
    expect(isSentryEnabled("vercel-preview")).toBe(false);
  });
});

describe("isLocalUrl", () => {
  it("detects localhost and loopback urls", () => {
    expect(isLocalUrl("http://localhost:4321")).toBe(true);
    expect(isLocalUrl("http://127.0.0.1:3000")).toBe(true);
    expect(isLocalUrl("http://[::1]:3000")).toBe(true);
  });

  it("returns false for non-localhost and malformed urls", () => {
    expect(isLocalUrl("https://example.com")).toBe(false);
    expect(isLocalUrl("not-a-url")).toBe(false);
    expect(isLocalUrl(undefined)).toBe(false);
  });
});

describe("beforeSendFilter", () => {
  it("drops events for non-production environments", () => {
    const event = { request: { url: "https://example.com" } };
    expect(
      beforeSendFilter(event, {
        environment: "development",
      })
    ).toBeNull();
  });

  it("drops localhost events in production", () => {
    const event = { request: { url: "http://localhost:4321/game" } };
    expect(
      beforeSendFilter(event, {
        environment: "production",
      })
    ).toBeNull();
  });

  it("keeps non-local production events", () => {
    const event = { request: { url: "https://example.com/play" } };
    expect(
      beforeSendFilter(event, {
        environment: "production",
      })
    ).toEqual(event);
  });
});
