import { describe, expect, it } from "vitest";
import {
  filterLocalhostEvent,
  isSentryEnabled,
  resolveSentryEnvironment,
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
  it("prefers explicit Sentry environment first", () => {
    expect(
      resolveSentryEnvironment({
        nodeEnv: "production",
        vercelEnv: "production",
        explicitEnvironment: "custom-env",
      })
    ).toBe("custom-env");
  });

  it("falls back to Vercel environment", () => {
    expect(
      resolveSentryEnvironment({
        nodeEnv: "production",
        vercelEnv: "preview",
        explicitEnvironment: undefined,
      })
    ).toBe("preview");
  });

  it("falls back to node env and then development", () => {
    expect(
      resolveSentryEnvironment({
        nodeEnv: "production",
        vercelEnv: undefined,
        explicitEnvironment: undefined,
      })
    ).toBe("production");
    expect(
      resolveSentryEnvironment({
        nodeEnv: undefined,
        vercelEnv: undefined,
        explicitEnvironment: undefined,
      })
    ).toBe("development");
  });
});

describe("filterLocalhostEvent", () => {
  it("drops localhost and loopback URLs", () => {
    const localhostUrl = ["http://localhost", "3000/wire"].join(":");
    const loopbackIpv4Url = ["http://127.0.0.1", "3000"].join(":");
    const loopbackIpv6Url = ["http://[::1]", "3000"].join(":");
    const wildcardHostUrl = ["http://0.0.0.0", "3000"].join(":");

    expect(
      filterLocalhostEvent({ request: { url: localhostUrl } })
    ).toBeNull();
    expect(
      filterLocalhostEvent({ request: { url: loopbackIpv4Url } })
    ).toBeNull();
    expect(
      filterLocalhostEvent({ request: { url: loopbackIpv6Url } })
    ).toBeNull();
    expect(
      filterLocalhostEvent({ request: { url: wildcardHostUrl } })
    ).toBeNull();
  });

  it("drops subdomain localhost URLs", () => {
    expect(
      filterLocalhostEvent({
        request: { url: "http://api.localhost:3000/endpoint" },
      })
    ).toBeNull();
  });

  it("keeps non-localhost URLs and malformed events", () => {
    const productionEvent = {
      request: { url: "https://margincall.xyz/traders/123" },
    };
    expect(filterLocalhostEvent(productionEvent)).toEqual(productionEvent);
    expect(filterLocalhostEvent({})).toEqual({});
    expect(
      filterLocalhostEvent({ request: { url: "not a valid url" } })
    ).toEqual({
      request: { url: "not a valid url" },
    });
  });
});
