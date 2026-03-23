import { describe, expect, it } from "vitest";
import { isSentryEnabled, shouldDropLocalhostEvent } from "@/lib/sentry/runtime";

describe("isSentryEnabled", () => {
  it("returns true in production", () => {
    expect(isSentryEnabled("production")).toBe(true);
  });

  it("returns false outside production", () => {
    expect(isSentryEnabled("development")).toBe(false);
    expect(isSentryEnabled("test")).toBe(false);
    expect(isSentryEnabled(undefined)).toBe(false);
  });
});

describe("shouldDropLocalhostEvent", () => {
  it("drops localhost request URLs", () => {
    expect(
      shouldDropLocalhostEvent({
        request: { url: "http://localhost:4321/dashboard" },
      } as never)
    ).toBe(true);
    expect(
      shouldDropLocalhostEvent({
        request: { url: "http://127.0.0.1:3000/dashboard" },
      } as never)
    ).toBe(true);
    expect(
      shouldDropLocalhostEvent({
        request: { url: "http://[::1]:3000/dashboard" },
      } as never)
    ).toBe(true);
  });

  it("keeps non-localhost request URLs", () => {
    expect(
      shouldDropLocalhostEvent({
        request: { url: "https://example.com/dashboard" },
      } as never)
    ).toBe(false);
  });

  it("keeps events without a request URL", () => {
    expect(shouldDropLocalhostEvent({} as never)).toBe(false);
  });
});
