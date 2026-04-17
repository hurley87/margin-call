import { describe, expect, it } from "vitest";

import {
  beforeSendFilter,
  isLocalUrl,
  isSentryEnabled,
  resolveSentryEnvironment,
} from "../event-filter";

describe("resolveSentryEnvironment", () => {
  it("returns vercel-production when Vercel environment is production", () => {
    expect(resolveSentryEnvironment("production", "production")).toBe(
      "vercel-production",
    );
  });

  it("returns production for production node environment", () => {
    expect(resolveSentryEnvironment("production", undefined)).toBe("production");
  });

  it("maps test node environment to development", () => {
    expect(resolveSentryEnvironment("test", undefined)).toBe("development");
  });

  it("normalizes casing and whitespace", () => {
    expect(resolveSentryEnvironment("  Development  ", undefined)).toBe(
      "development",
    );
  });

  it("falls back to development when node env is unavailable", () => {
    expect(resolveSentryEnvironment(undefined, undefined)).toBe("development");
  });
});

describe("isSentryEnabled", () => {
  it("enables Sentry for production", () => {
    expect(isSentryEnabled("production")).toBe(true);
  });

  it("enables Sentry for vercel-production", () => {
    expect(isSentryEnabled("vercel-production")).toBe(true);
  });

  it("disables Sentry for non-production environments", () => {
    expect(isSentryEnabled("development")).toBe(false);
    expect(isSentryEnabled("preview")).toBe(false);
  });
});

describe("isLocalUrl", () => {
  it("detects localhost and loopback hosts", () => {
    expect(isLocalUrl("https://127.0.0.1:3000/home")).toBe(true);
    expect(isLocalUrl("https://127.0.0.1:3000/home")).toBe(true);
    expect(isLocalUrl("http://0.0.0.0:3000/home")).toBe(true);
    expect(isLocalUrl("http://[::1]:3000/home")).toBe(true);
  });

  it("ignores non-local hosts and invalid URLs", () => {
    expect(isLocalUrl("https://example.com/deals")).toBe(false);
    expect(isLocalUrl("not-a-url")).toBe(false);
    expect(isLocalUrl(null)).toBe(false);
  });
});

describe("beforeSendFilter", () => {
  it("drops events outside production environments", () => {
    const event = { request: { url: "https://example.com/deals" } };
    expect(beforeSendFilter(event, "development")).toBeNull();
  });

  it("drops localhost events in production", () => {
    const event = { request: { url: "https://127.0.0.1:3000/deals" } };
    expect(beforeSendFilter(event, "production")).toBeNull();
  });

  it("keeps production events with non-local URLs", () => {
    const event = { request: { url: "https://example.com/deals" } };
    expect(beforeSendFilter(event, "production")).toEqual(event);
  });
});
