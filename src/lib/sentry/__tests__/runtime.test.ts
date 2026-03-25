import type { Event } from "@sentry/nextjs";
import { describe, expect, it } from "vitest";

import {
  filterLocalhostEvents,
  isSentryEnabled,
  resolveSentryEnvironment,
} from "@/lib/sentry/runtime";

describe("isSentryEnabled", () => {
  it("returns true for production", () => {
    expect(isSentryEnabled("production")).toBe(true);
  });

  it("returns false for non-production environments", () => {
    expect(isSentryEnabled("development")).toBe(false);
    expect(isSentryEnabled(undefined)).toBe(false);
  });
});

describe("resolveSentryEnvironment", () => {
  it("returns provided environment string", () => {
    expect(resolveSentryEnvironment("production")).toBe("production");
    expect(resolveSentryEnvironment("development")).toBe("development");
  });

  it("returns unknown when environment is missing", () => {
    expect(resolveSentryEnvironment(undefined)).toBe("unknown");
  });
});

describe("filterLocalhostEvents", () => {
  it("drops localhost events", () => {
    const localhostUrl = `http://${"localhost"}:3000/wire`;
    const event = {
      request: { url: localhostUrl },
    } as Event;

    expect(filterLocalhostEvents(event)).toBeNull();
  });

  it("drops loopback ipv4 and ipv6 events", () => {
    const ipv4Event = {
      request: { url: "http://127.0.0.1:3000/wire" },
    } as Event;
    const ipv6Event = {
      request: { url: "http://[::1]:3000/wire" },
    } as Event;

    expect(filterLocalhostEvents(ipv4Event)).toBeNull();
    expect(filterLocalhostEvents(ipv6Event)).toBeNull();
  });

  it("keeps non-localhost and malformed URL events", () => {
    const productionEvent = {
      request: { url: "https://example.org/wire" },
    } as Event;
    const malformedEvent = {
      request: { url: "not a valid url" },
    } as Event;
    const noRequestEvent = {} as Event;

    expect(filterLocalhostEvents(productionEvent)).toEqual(productionEvent);
    expect(filterLocalhostEvents(malformedEvent)).toEqual(malformedEvent);
    expect(filterLocalhostEvents(noRequestEvent)).toEqual(noRequestEvent);
  });
});
