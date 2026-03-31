import { describe, expect, it } from "vitest";
import { resolveSentryRuntimeConfig } from "@/lib/sentry-runtime-config";

describe("resolveSentryRuntimeConfig", () => {
  it("uses explicit SENTRY_ENVIRONMENT when provided", () => {
    const config = resolveSentryRuntimeConfig({
      runtime: "client",
      env: {
        NEXT_PUBLIC_SENTRY_DSN: "https://public@example.ingest.sentry.io/123",
        SENTRY_ENVIRONMENT: "staging",
        NODE_ENV: "production",
        VERCEL_ENV: "production",
      },
    });

    expect(config.environment).toBe("staging");
    expect(config.enabled).toBe(true);
  });

  it("maps Vercel production to production", () => {
    const config = resolveSentryRuntimeConfig({
      runtime: "server",
      env: {
        SENTRY_DSN: "https://secret@example.ingest.sentry.io/456",
        VERCEL_ENV: "production",
        NODE_ENV: "development",
      },
    });

    expect(config.environment).toBe("production");
    expect(config.dsn).toContain("ingest.sentry.io");
  });

  it("maps Vercel preview to preview", () => {
    const config = resolveSentryRuntimeConfig({
      runtime: "edge",
      env: {
        SENTRY_DSN: "https://secret@example.ingest.sentry.io/456",
        VERCEL_ENV: "preview",
        NODE_ENV: "production",
      },
    });

    expect(config.environment).toBe("preview");
  });

  it("falls back to NODE_ENV when VERCEL_ENV is absent", () => {
    const config = resolveSentryRuntimeConfig({
      runtime: "server",
      env: {
        SENTRY_DSN: "https://secret@example.ingest.sentry.io/456",
        NODE_ENV: "production",
      },
    });

    expect(config.environment).toBe("production");
  });

  it("disables Sentry when DSN is missing", () => {
    const config = resolveSentryRuntimeConfig({
      runtime: "server",
      env: {
        NODE_ENV: "production",
      },
    });

    expect(config.dsn).toBeUndefined();
    expect(config.enabled).toBe(false);
  });

  it("uses NEXT_PUBLIC_SENTRY_DSN for client runtime", () => {
    const config = resolveSentryRuntimeConfig({
      runtime: "client",
      env: {
        NEXT_PUBLIC_SENTRY_DSN: "https://public@example.ingest.sentry.io/123",
        NODE_ENV: "development",
      },
    });

    expect(config.dsn).toBe("https://public@example.ingest.sentry.io/123");
    expect(config.enabled).toBe(true);
  });

  it("prefers SENTRY_DSN on server runtimes", () => {
    const config = resolveSentryRuntimeConfig({
      runtime: "server",
      env: {
        SENTRY_DSN: "https://private@example.ingest.sentry.io/999",
        NEXT_PUBLIC_SENTRY_DSN: "https://public@example.ingest.sentry.io/123",
        NODE_ENV: "production",
      },
    });

    expect(config.dsn).toBe("https://private@example.ingest.sentry.io/999");
  });
});
