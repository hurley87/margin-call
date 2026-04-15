import { describe, expect, it } from "vitest";
import type { Event } from "@sentry/nextjs";

import {
  beforeSendFilter,
  isLocalUrl,
  isSentryEnabled,
  resolveSentryEnvironment,
} from "@/lib/sentry/event-filter";

describe("resolveSentryEnvironment", () => {
  it("prefers vercel-production for Vercel production deploys", () => {
    expect(resolveSentryEnvironment("production", "production")).toBe("vercel-production");
  });

  it("falls back to NODE_ENV when VERCEL_ENV is not production", () => {
    expect(resolveSentryEnvironment("production", "preview")).toBe("production");
  });

  it("returns development when NODE_ENV is undefined", () => {
    expect(resolveSentryEnvironment(undefined, undefined)).toBe("development");
  });
});

describe("isSentryEnabled", () => {
  it("enables production", () => {
    expect(isSentryEnabled("production")).toBe(true);
  });

  it("enables vercel-production", () => {
    expect(isSentryEnabled("vercel-production")).toBe(true);
  });

  it("disables non-production environments", () => {
    expect(isSentryEnabled("development")).toBe(false);
    expect(isSentryEnabled("preview")).toBe(false);
    expect(isSentryEnabled("test")).toBe(false);
  });
});

describe("isLocalUrl", () => {
  it("detects localhost", () => {
    expect(isLocalUrl("http://localhost:3100/wire")).toBe(true);
  });

  it("detects IPv4 loopback", () => {
    expect(isLocalUrl("http://127.0.0.1:3000/wire")).toBe(true);
  });

  it("detects bracketed IPv6 loopback", () => {
    expect(isLocalUrl("http://[::1]:3000/wire")).toBe(true);
  });

  it("ignores non-localhost URLs and malformed values", () => {
    expect(isLocalUrl("https://example.com/wire")).toBe(false);
    expect(isLocalUrl("not-a-url")).toBe(false);
  });
});

describe("beforeSendFilter", () => {
  it("drops events when runtime environment is not production-like", () => {
    const event = { message: "dev error" } satisfies Event;
    expect(beforeSendFilter(event, "development")).toBeNull();
  });

  it("drops localhost events even in production-like runtime", () => {
    const event = { request: { url: "http://localhost:3100/wire" } } satisfies Event;
    expect(beforeSendFilter(event, "production")).toBeNull();
  });

  it("drops events with explicit non-production event.environment", () => {
    const event = {
      environment: "development",
      request: { url: "https://example.com/wire" },
    } satisfies Event;

    expect(beforeSendFilter(event, "production")).toBeNull();
  });

  it("keeps production events for non-local URLs", () => {
    const event = {
      environment: "production",
      request: { url: "https://example.com/wire" },
    } satisfies Event;

    expect(beforeSendFilter(event, "production")).toEqual(event);
  });
});
