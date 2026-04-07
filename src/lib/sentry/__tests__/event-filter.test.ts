import { describe, expect, it } from "vitest";
import {
  isProductionRuntimeEnvironment,
  normalizeRuntimeEnvironment,
  resolveRuntimeEnvironment,
  shouldDropSentryEvent,
  type MinimalSentryEvent,
} from "@/lib/sentry/event-filter";

describe("normalizeRuntimeEnvironment", () => {
  it("normalizes case and whitespace", () => {
    expect(normalizeRuntimeEnvironment("  Production  ")).toBe("production");
  });

  it("returns null for empty inputs", () => {
    expect(normalizeRuntimeEnvironment("   ")).toBeNull();
    expect(normalizeRuntimeEnvironment(undefined)).toBeNull();
    expect(normalizeRuntimeEnvironment(null)).toBeNull();
  });
});

describe("isProductionRuntimeEnvironment", () => {
  it("accepts known production aliases", () => {
    expect(isProductionRuntimeEnvironment("production")).toBe(true);
    expect(isProductionRuntimeEnvironment("prod")).toBe(true);
    expect(isProductionRuntimeEnvironment("vercel-production")).toBe(true);
  });

  it("rejects non-production values", () => {
    expect(isProductionRuntimeEnvironment("development")).toBe(false);
    expect(isProductionRuntimeEnvironment("preview")).toBe(false);
    expect(isProductionRuntimeEnvironment("staging")).toBe(false);
  });
});

describe("resolveRuntimeEnvironment", () => {
  it("respects environment variable precedence", () => {
    expect(
      resolveRuntimeEnvironment({
        SENTRY_ENVIRONMENT: "production",
        NEXT_PUBLIC_SENTRY_ENVIRONMENT: "preview",
        VERCEL_ENV: "preview",
        NEXT_PUBLIC_VERCEL_ENV: "preview",
        NODE_ENV: "development",
      })
    ).toBe("production");

    expect(
      resolveRuntimeEnvironment({
        NEXT_PUBLIC_SENTRY_ENVIRONMENT: "production",
        VERCEL_ENV: "preview",
        NODE_ENV: "development",
      })
    ).toBe("production");
  });
});

describe("shouldDropSentryEvent", () => {
  const productionEvent: MinimalSentryEvent = {
    request: { url: "https://example.com/traders/123" },
  };
  const localhostUrl = "http://localhost:3000/traders/abc"; // pragma: allowlist secret

  it("drops all events for non-production runtimes", () => {
    expect(shouldDropSentryEvent(productionEvent, "development")).toBe(true);
    expect(shouldDropSentryEvent(productionEvent, "preview")).toBe(true);
  });

  it("drops localhost events in production runtime", () => {
    expect(shouldDropSentryEvent({ request: { url: localhostUrl } }, "production")).toBe(true);

    expect(
      shouldDropSentryEvent(
        { request: { url: "http://127.0.0.1:3000/traders/abc" } },
        "production"
      )
    ).toBe(true);

    expect(
      shouldDropSentryEvent(
        { request: { url: "http://[::1]:3000/traders/abc" } },
        "production"
      )
    ).toBe(true);
  });

  it("drops events explicitly tagged with non-production environments", () => {
    expect(
      shouldDropSentryEvent(
        {
          request: { url: "https://example.com/traders/abc" },
          environment: "development",
        },
        "production"
      )
    ).toBe(true);

    expect(
      shouldDropSentryEvent(
        {
          request: { url: "https://example.com/traders/abc" },
          tags: { environment: "preview" },
        },
        "production"
      )
    ).toBe(true);
  });

  it("keeps valid production events", () => {
    expect(
      shouldDropSentryEvent(
        {
          request: { url: "https://example.com/traders/abc" },
          environment: "production",
        },
        "production"
      )
    ).toBe(false);
  });
});
