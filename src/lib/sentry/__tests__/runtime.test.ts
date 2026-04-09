import { describe, expect, it } from "vitest";
import {
  isSentryEnabled,
  resolveSentryEnvironment,
  shouldDropSentryEvent,
} from "@/lib/sentry/runtime";

describe("isSentryEnabled", () => {
  it("enables Sentry only in production", () => {
    expect(isSentryEnabled("production")).toBe(true);
    expect(isSentryEnabled("development")).toBe(false);
    expect(isSentryEnabled("test")).toBe(false);
    expect(isSentryEnabled(undefined)).toBe(false);
  });
});

describe("resolveSentryEnvironment", () => {
  it("maps NODE_ENV to explicit sentry environments", () => {
    expect(resolveSentryEnvironment("production")).toBe("production");
    expect(resolveSentryEnvironment("test")).toBe("test");
    expect(resolveSentryEnvironment("development")).toBe("development");
    expect(resolveSentryEnvironment(undefined)).toBe("development");
  });
});

describe("shouldDropSentryEvent", () => {
  it("drops events with localhost host in request url", () => {
    expect(
      shouldDropSentryEvent({
        request: {
          url: "http://localhost:3000/traders/abc", // pragma: allowlist secret
        },
      })
    ).toBe(true);
  });

  it("drops events with localhost tag url", () => {
    expect(
      shouldDropSentryEvent({
        tags: {
          url: "http://127.0.0.1:3000/wire",
        },
      })
    ).toBe(true);
  });

  it("keeps events from non-localhost domains", () => {
    expect(
      shouldDropSentryEvent({
        request: {
          url: "https://example.com/traders/abc",
        },
      })
    ).toBe(false);
  });

  it("keeps events when url is absent or invalid", () => {
    expect(shouldDropSentryEvent({})).toBe(false);
    expect(
      shouldDropSentryEvent({
        request: {
          url: "/relative/path",
        },
      })
    ).toBe(false);
  });

  it("drops events for ipv6 localhost loopback", () => {
    expect(
      shouldDropSentryEvent({
        request: {
          url: "http://[::1]:3000",
        },
      })
    ).toBe(true);
  });
});
