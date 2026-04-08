import { describe, expect, it } from "vitest";

import {
  beforeSendFilter,
  isLocalUrl,
  isSentryEnabled,
  resolveSentryEnvironment,
} from "@/lib/sentry/event-filter";

const LOCALHOST_URL = "http://localhost:3000"; // pragma: allowlist secret

describe("resolveSentryEnvironment", () => {
  it("returns production in production runtime", () => {
    expect(resolveSentryEnvironment("production")).toBe("production");
  });

  it("returns test in test runtime", () => {
    expect(resolveSentryEnvironment("test")).toBe("test");
  });

  it("defaults to development for unknown runtime values", () => {
    expect(resolveSentryEnvironment(undefined)).toBe("development");
    expect(resolveSentryEnvironment("preview")).toBe("development");
  });
});

describe("isSentryEnabled", () => {
  it("enables transport only for production runtime", () => {
    expect(isSentryEnabled("production")).toBe(true);
    expect(isSentryEnabled("development")).toBe(false);
    expect(isSentryEnabled("test")).toBe(false);
  });
});

describe("isLocalUrl", () => {
  it("detects localhost and loopback URLs", () => {
    expect(isLocalUrl(`${LOCALHOST_URL}/demo`)).toBe(true);
    expect(isLocalUrl("http://127.0.0.1:3000/demo")).toBe(true);
    expect(isLocalUrl("http://[::1]:3000/demo")).toBe(true);
  });

  it("allows non-localhost URLs and malformed input", () => {
    expect(isLocalUrl("https://example.test")).toBe(false);
    expect(isLocalUrl("not-a-url")).toBe(false);
    expect(isLocalUrl(undefined)).toBe(false);
  });
});

describe("beforeSendFilter", () => {
  it("drops all non-production events", () => {
    const filter = beforeSendFilter("development");
    const event = { request: { url: "https://example.test" } };

    expect(filter(event, {})).toBeNull();
  });

  it("drops localhost requests in production", () => {
    const filter = beforeSendFilter("production");
    const event = { request: { url: `${LOCALHOST_URL}/path` } };

    expect(filter(event, {})).toBeNull();
  });

  it("keeps non-localhost requests in production", () => {
    const filter = beforeSendFilter("production");
    const event = { request: { url: "https://example.test/path" } };

    expect(filter(event, {})).toEqual(event);
  });
});
