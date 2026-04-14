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
      resolveSentryEnvironment("development", "preview", " production ")
    ).toBe("production");
  });

  it("maps vercel production to a stable tag", () => {
    expect(resolveSentryEnvironment("development", "production")).toBe(
      "vercel-production"
    );
  });

  it("falls back to node env and then development", () => {
    expect(resolveSentryEnvironment("test")).toBe("test");
    expect(resolveSentryEnvironment(undefined, undefined, undefined)).toBe(
      "development"
    );
  });
});

describe("isSentryEnabled", () => {
  it("allows only production-like environments", () => {
    expect(isSentryEnabled("production")).toBe(true);
    expect(isSentryEnabled("vercel-production")).toBe(true);
    expect(isSentryEnabled("development")).toBe(false);
  });
});

describe("isLocalUrl", () => {
  it("recognizes localhost and loopback hosts", () => {
    expect(isLocalUrl("http://localhost:3000/trader")).toBe(true); // pragma: allowlist secret
    expect(isLocalUrl("http://127.0.0.1:3000/trader")).toBe(true);
    expect(isLocalUrl("http://[::1]:3000/trader")).toBe(true);
  });

  it("ignores non-local and malformed urls", () => {
    expect(isLocalUrl("https://margincall.app/trader")).toBe(false);
    expect(isLocalUrl("not a url")).toBe(false);
  });
});

describe("beforeSendFilter", () => {
  it("drops non-production environment events", () => {
    const event = { environment: "development" };
    expect(beforeSendFilter(event, "development")).toBeNull();
  });

  it("drops localhost urls even in production", () => {
    const event = {
      environment: "production",
      request: { url: "http://localhost:3000/deals" }, // pragma: allowlist secret
    };
    expect(beforeSendFilter(event, "production")).toBeNull();
  });

  it("keeps production events for non-local urls", () => {
    const event = {
      environment: "production",
      request: { url: "https://margincall.app/deals" },
    };
    expect(beforeSendFilter(event, "production")).toEqual(event);
  });

  it("uses default environment when event environment is missing", () => {
    const event = { request: { url: "https://margincall.app/deals" } };
    expect(beforeSendFilter(event, "production")).toEqual(event);
    expect(beforeSendFilter(event, "development")).toBeNull();
  });
});
