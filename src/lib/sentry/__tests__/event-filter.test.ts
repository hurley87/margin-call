import { describe, expect, it } from "vitest";

import {
  beforeSendFilter,
  isLocalUrl,
  isSentryEnabled,
  resolveSentryEnvironment,
} from "@/lib/sentry/event-filter";

describe("resolveSentryEnvironment", () => {
  it("prefers explicit sentry environment", () => {
    expect(
      resolveSentryEnvironment({
        nodeEnv: "production",
        vercelEnv: "production",
        sentryEnvironment: "custom-prod",
      })
    ).toBe("custom-prod");
  });

  it("maps vercel production to vercel-production", () => {
    expect(
      resolveSentryEnvironment({
        nodeEnv: "production",
        vercelEnv: "production",
      })
    ).toBe("vercel-production");
  });

  it("maps vercel preview to vercel-preview", () => {
    expect(
      resolveSentryEnvironment({
        nodeEnv: "production",
        vercelEnv: "preview",
      })
    ).toBe("vercel-preview");
  });

  it("falls back to production when only node env is production", () => {
    expect(resolveSentryEnvironment({ nodeEnv: "production" })).toBe(
      "production"
    );
  });

  it("defaults to development", () => {
    expect(resolveSentryEnvironment({})).toBe("development");
  });
});

describe("isSentryEnabled", () => {
  it("enables sentry for production environments", () => {
    expect(isSentryEnabled("production")).toBe(true);
    expect(isSentryEnabled("vercel-production")).toBe(true);
  });

  it("disables sentry for non-production environments", () => {
    expect(isSentryEnabled("development")).toBe(false);
    expect(isSentryEnabled("vercel-preview")).toBe(false);
  });
});

describe("isLocalUrl", () => {
  it("detects localhost and loopback urls", () => {
    expect(isLocalUrl("http://localhost:3000/dashboard")).toBe(true); // pragma: allowlist secret
    expect(isLocalUrl("http://127.0.0.1:3000/home")).toBe(true);
    expect(isLocalUrl("http://[::1]:3000/path")).toBe(true);
    expect(isLocalUrl("http://0.0.0.0:3000")).toBe(true);
  });

  it("returns false for non-localhost urls or invalid values", () => {
    expect(isLocalUrl("https://api.example.test/trade")).toBe(false);
    expect(isLocalUrl("/relative/path")).toBe(false);
    expect(isLocalUrl(null)).toBe(false);
  });
});

describe("beforeSendFilter", () => {
  it("drops events in non-production environments", () => {
    const event = { request: { url: "https://app.example.test" } };

    expect(beforeSendFilter(event, "development")).toBeNull();
  });

  it("drops localhost events in production", () => {
    const event = { request: { url: "http://localhost:3000/wallet" } }; // pragma: allowlist secret

    expect(beforeSendFilter(event, "production")).toBeNull();
  });

  it("keeps non-localhost production events", () => {
    const event = { request: { url: "https://api.example.test/trade" } };

    expect(beforeSendFilter(event, "production")).toEqual(event);
  });
});
