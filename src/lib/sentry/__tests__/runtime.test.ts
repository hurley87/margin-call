import { describe, expect, it } from "vitest";
import { isSentryEnabled } from "@/lib/sentry/runtime";

describe("isSentryEnabled", () => {
  it("enables Sentry only for production", () => {
    expect(isSentryEnabled("production")).toBe(true);
    expect(isSentryEnabled("development")).toBe(false);
    expect(isSentryEnabled("test")).toBe(false);
    expect(isSentryEnabled(undefined)).toBe(false);
  });
});
