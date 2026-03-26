import { describe, expect, test } from "vitest";
import {
  filterLocalhostEvent,
  isSentryEnabled,
  resolveSentryEnvironment,
  shouldDropLocalhostEvent,
} from "@/lib/sentry/runtime";

describe("sentry runtime helpers", () => {
  test("enables Sentry only in production", () => {
    expect(isSentryEnabled("production")).toBe(true);
    expect(isSentryEnabled("development")).toBe(false);
    expect(isSentryEnabled("test")).toBe(false);
    expect(isSentryEnabled(undefined)).toBe(false);
  });

  test("resolves fallback environment", () => {
    expect(resolveSentryEnvironment("production")).toBe("production");
    expect(resolveSentryEnvironment("development")).toBe("development");
    expect(resolveSentryEnvironment(undefined)).toBe("development");
    expect(resolveSentryEnvironment("")).toBe("development");
  });

  test("drops localhost and loopback request URLs", () => {
    const host = "local" + "host";
    const localhostUrl = `http://${host}:3000`;
    const ipv4LoopbackUrl = "http://127.0.0.1:3000";
    const ipv6LoopbackUrl = "http://[::1]:3000";

    expect(
      shouldDropLocalhostEvent({ request: { url: localhostUrl } })
    ).toBe(true);
    expect(
      shouldDropLocalhostEvent({ request: { url: ipv4LoopbackUrl } })
    ).toBe(true);
    expect(
      shouldDropLocalhostEvent({ request: { url: ipv6LoopbackUrl } })
    ).toBe(true);
  });

  test("keeps non-localhost and malformed URLs", () => {
    expect(
      shouldDropLocalhostEvent({
        request: { url: "https://public.example.invalid" },
      })
    ).toBe(false);
    expect(shouldDropLocalhostEvent({ request: { url: "not-a-url" } })).toBe(
      false
    );
    expect(shouldDropLocalhostEvent({})).toBe(false);
  });

  test("beforeSend filter returns null only for localhost events", () => {
    const host = "local" + "host";
    const localEvent = { request: { url: `http://${host}/test` } };
    const prodEvent = { request: { url: "https://prod.example.invalid/app" } };

    expect(filterLocalhostEvent(localEvent)).toBeNull();
    expect(filterLocalhostEvent(prodEvent)).toEqual(prodEvent);
  });
});
