import { afterEach, describe, expect, it } from "vitest";
import { shouldIgnoreDevClientError } from "@/lib/sentry/should-ignore-client-error";

const originalNodeEnv = process.env.NODE_ENV;

afterEach(() => {
  process.env.NODE_ENV = originalNodeEnv;
});

describe("shouldIgnoreDevClientError", () => {
  it("ignores known Fast Refresh reference errors on localhost in development", () => {
    expect(
      shouldIgnoreDevClientError({
        environment: "development",
        message: "ReferenceError: useDepositFlow is not defined",
        request: { url: "http://127.0.0.1:3100/traders/abc" },
      })
    ).toBe(true);
  });

  it("ignores hook-order errors when stack shows React Fast Refresh", () => {
    expect(
      shouldIgnoreDevClientError({
        environment: "development",
        message: "Error: Rendered more hooks than during the previous render.",
        exception: {
          values: [
            {
              stacktrace: {
                frames: [{ function: "Object.performReactRefresh" }],
              },
            },
          ],
        },
      })
    ).toBe(true);
  });

  it("does not ignore matching errors outside development", () => {
    expect(
      shouldIgnoreDevClientError({
        environment: "production",
        message: "ReferenceError: useDepositFlow is not defined",
        request: { url: "http://127.0.0.1:3100/traders/abc" },
      })
    ).toBe(false);
  });

  it("does not ignore unrelated messages even in development", () => {
    expect(
      shouldIgnoreDevClientError({
        environment: "development",
        message: "TypeError: Cannot read properties of undefined",
        request: { url: "http://127.0.0.1:3100/traders/abc" },
      })
    ).toBe(false);
  });

  it("does not ignore known messages without refresh signals", () => {
    expect(
      shouldIgnoreDevClientError({
        environment: "development",
        message: "ReferenceError: useDepositFlow is not defined",
        request: { url: "https://example.com/traders/abc" },
      })
    ).toBe(false);
  });

  it("uses NODE_ENV fallback when event environment is missing", () => {
    process.env.NODE_ENV = "development";

    expect(
      shouldIgnoreDevClientError({
        message: "ReferenceError: useDepositFlow is not defined",
        request: { url: "http://127.0.0.1:3100/traders/abc" },
      })
    ).toBe(true);
  });
});
