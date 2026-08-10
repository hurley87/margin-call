import * as Sentry from "@sentry/nextjs";
import { describe, expect, it } from "vitest";

import {
  sanitizeTelemetryPayload,
  sentryPrivacyOptions,
} from "@/lib/telemetry/privacy";

const SYNTHETIC_PHONE = "+1 (555) 010-0200";
const SYNTHETIC_TOKEN = "synthetic-token-do-not-use";
const SYNTHETIC_COOKIE = "privy-session=synthetic-session-do-not-use";
const SYNTHETIC_PRIVY_SIGNATURE = "synthetic-privy-signature-do-not-use";
const SYNTHETIC_PRIVY_AUTHORIZATION =
  "synthetic-privy-authorization-do-not-use";
const SYNTHETIC_PRIVY_SESSION = "synthetic-privy-session-do-not-use";
const SYNTHETIC_PRIVY_IDENTITY = "synthetic-privy-identity-do-not-use";
const SYNTHETIC_API_KEY = "synthetic-api-key-do-not-use";
const PUBLIC_PRIVY_APP_ID = "cm_public_app_id";
const WALLET_ADDRESS = "0x1234567890abcdef1234567890abcdef12345678";
const TRANSACTION_HASH =
  "0xabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcd";

describe("sanitizeTelemetryPayload", () => {
  it("redacts phone numbers stored as digits-only strings", () => {
    expect(
      sanitizeTelemetryPayload({
        to: "15555550123",
        contact: "5550100200",
      })
    ).toEqual({ to: "[REDACTED]", contact: "[REDACTED]" });
  });

  it("keeps whole-string numeric values that are not phone-shaped", () => {
    expect(
      sanitizeTelemetryPayload({
        blockTimestamp: "1786367706",
        chainId: "84532",
        weiValue: "1786367706463",
      })
    ).toEqual({
      blockTimestamp: "1786367706",
      chainId: "84532",
      weiValue: "1786367706463",
    });
  });

  it("redacts sensitive keys inside JSON-serialized text", () => {
    expect(
      sanitizeTelemetryPayload('{"token":"synthetic.jwt.value","retryCount":3}')
    ).toBe('{"token":[REDACTED],"retryCount":3}');
    expect(
      sanitizeTelemetryPayload('{"identity_token":"synthetic","safe":"kept"}')
    ).toBe('{"identity_token":[REDACTED],"safe":"kept"}');
  });

  it("preserves Error diagnostics while redacting their messages", () => {
    const sanitized = sanitizeTelemetryPayload({
      error: new Error("Login failed for +1 (555) 010-0200"),
    });

    expect(sanitized.error).toMatchObject({
      name: "Error",
      message: "Login failed for [REDACTED]",
    });
    expect((sanitized.error as unknown as { stack?: string }).stack).toContain(
      "Error"
    );
  });

  it("preserves Date, Map, and Set values instead of flattening them", () => {
    const timestamp = new Date("2026-08-10T00:00:00.000Z");
    const sanitized = sanitizeTelemetryPayload({
      when: timestamp,
      details: new Map<string, unknown>([
        ["authToken", "synthetic-token"],
        ["retryCount", 3],
      ]),
      seenChains: new Set([84532]),
    });

    expect(sanitized.when).toEqual(timestamp);
    expect(sanitized.details).toEqual({
      authToken: "[REDACTED]",
      retryCount: 3,
    });
    expect(sanitized.seenChains).toEqual([84532]);
  });
});

describe("Sentry telemetry privacy boundary", () => {
  it("redacts sensitive data at the Sentry payload boundary while preserving safe diagnostics", async () => {
    const envelopes: unknown[] = [];

    Sentry.init({
      dsn: "https://public@example.invalid/1",
      tracesSampleRate: 1,
      transport: () => ({
        send: async (envelope: unknown) => {
          envelopes.push(envelope);
          return {};
        },
        flush: async () => true,
      }),
      ...sentryPrivacyOptions,
    });

    Sentry.addBreadcrumb({
      category: "auth",
      message: `SMS login for ${SYNTHETIC_PHONE} with Bearer ${SYNTHETIC_TOKEN}`,
      data: {
        phone: SYNTHETIC_PHONE,
        authorization: `Bearer ${SYNTHETIC_TOKEN}`,
      },
    });

    Sentry.captureEvent({
      exception: {
        values: [
          {
            type: "Error",
            value: `Login failed for ${SYNTHETIC_PHONE}; Bearer ${SYNTHETIC_TOKEN}; auth_state=${SYNTHETIC_TOKEN}`,
          },
        ],
      },
      request: {
        headers: {
          Authorization: `Bearer ${SYNTHETIC_TOKEN}`,
          "Proxy-Authorization": `Basic ${SYNTHETIC_TOKEN}`,
          "Privy-Authorization-Signature": SYNTHETIC_PRIVY_SIGNATURE,
          "X-Privy-Authorization": SYNTHETIC_PRIVY_AUTHORIZATION,
          "X-API-Key": SYNTHETIC_API_KEY,
          "X-Request-Id": "safe-request-id",
        },
        cookies: {
          privySession: SYNTHETIC_COOKIE,
        },
        data: {
          phoneNumber: SYNTHETIC_PHONE,
          nested: {
            access_token: SYNTHETIC_TOKEN,
          },
        },
      },
      user: {
        id: WALLET_ADDRESS,
        phone: SYNTHETIC_PHONE,
      },
      tags: {
        auth_state: SYNTHETIC_TOKEN,
        chain_id: "84532",
      },
      extra: {
        transactionHash: TRANSACTION_HASH,
        retryCount: 3,
        privySession: SYNTHETIC_PRIVY_SESSION,
        "privy-session": SYNTHETIC_PRIVY_SESSION,
        privyAppId: PUBLIC_PRIVY_APP_ID,
        sessionDurationMs: 90_000,
        nested: {
          identityToken: SYNTHETIC_TOKEN,
          phone: SYNTHETIC_PHONE,
        },
      },
      contexts: {
        privacy: {
          privyIdentity: SYNTHETIC_PRIVY_IDENTITY,
          apiKey: SYNTHETIC_API_KEY,
          sessionDurationMs: 120_000,
          privySessionDurationMs: 180_000,
        },
      },
    });

    Sentry.startSpan(
      {
        name: `auth refresh for ${SYNTHETIC_PHONE}`,
        op: "http.client",
        attributes: {
          auth_token: SYNTHETIC_TOKEN,
          wallet_address: WALLET_ADDRESS,
          transaction_hash: TRANSACTION_HASH,
          retry_count: 3,
        },
      },
      () => undefined
    );

    await Sentry.flush(1_000);

    const payload = JSON.stringify(envelopes);

    expect(payload).not.toContain(SYNTHETIC_PHONE);
    expect(payload).not.toContain(SYNTHETIC_TOKEN);
    expect(payload).not.toContain(SYNTHETIC_COOKIE);
    expect(payload).not.toContain(SYNTHETIC_PRIVY_SIGNATURE);
    expect(payload).not.toContain(SYNTHETIC_PRIVY_AUTHORIZATION);
    expect(payload).not.toContain(SYNTHETIC_PRIVY_SESSION);
    expect(payload).not.toContain(SYNTHETIC_PRIVY_IDENTITY);
    expect(payload).not.toContain(SYNTHETIC_API_KEY);
    expect(payload).toContain(WALLET_ADDRESS);
    expect(payload).toContain(TRANSACTION_HASH);
    expect(payload).toContain(PUBLIC_PRIVY_APP_ID);
    expect(payload).toContain('"retryCount":3');
    expect(payload).toContain('"retry_count":3');
    expect(payload).toContain('"chain_id":"84532"');
    expect(payload).toContain('"sessionDurationMs":90000');
    expect(payload).toContain('"sessionDurationMs":120000');
    expect(payload).toContain('"privySessionDurationMs":180000');
  });
});
