import type { Breadcrumb, ErrorEvent, Log } from "@sentry/nextjs";

const REDACTED = "[REDACTED]";

const SENSITIVE_KEY_PATTERN =
  "(?:authorization|proxy[-_]?authorization|access[-_]?token|auth[-_]?token|identity[-_]?token|id[-_]?token|refresh[-_]?token|session[-_]?token|token|(?:auth(?:entication)?|session|identity)(?:[-_][a-z0-9]+)?|phone(?:[-_]?number)?|cookie|password|secret|credential)";

const BEARER_OR_BASIC_CREDENTIAL = /\b(bearer|basic)\s+[^\s,;]+/gi;
// The optional quote group lets the same rule catch JSON-serialized payloads
// ("token":"…") in addition to bare key=value / key: value assignments.
const SENSITIVE_ASSIGNMENT = new RegExp(
  `(["']?)\\b${SENSITIVE_KEY_PATTERN}\\b\\1\\s*[:=]\\s*(?:"[^"]*"|'[^']*'|[^\\s,;}&]+)`,
  "gi"
);
const SENSITIVE_QUERY_PARAMETER = new RegExp(
  `([?&#;]\\s*${SENSITIVE_KEY_PATTERN}\\s*=)[^&#\\s]*`,
  "gi"
);
// Any NANP-shaped digit run is redacted, even when it could be a numeric ID:
// a phone-shaped value is indistinguishable from a phone number, and this
// boundary prefers over-redaction to leaking PII.
const NORTH_AMERICAN_PHONE =
  /(?<![A-Za-z0-9])(?:\+?1[\s.-]?)?(?:\(?[2-9]\d{2}\)?[\s.-]?)\d{3}[\s.-]?\d{4}(?![A-Za-z0-9])/g;
const INTERNATIONAL_PHONE =
  /(?<![A-Za-z0-9])\+\d{1,3}(?:[()\s.-]*\d){6,14}(?![A-Za-z0-9])/g;

function isSensitiveKey(key: string) {
  const normalized = key.replace(/[^a-z0-9]/gi, "").toLowerCase();
  const isSessionMetric =
    (normalized.startsWith("session") ||
      normalized.startsWith("privysession")) &&
    /(duration|elapsed|time|age|count|timeout|ttl|started|expires)/.test(
      normalized
    );
  const isPrivyCredential =
    normalized.startsWith("privyauth") ||
    normalized.startsWith("privyauthorization") ||
    normalized.startsWith("privyidentity") ||
    normalized.startsWith("privytoken") ||
    normalized.startsWith("privycookie") ||
    (normalized.startsWith("privysession") && !isSessionMetric) ||
    /(?:^|[-_])privy[-_](?:auth|authorization|session|identity|token|cookie)/i.test(
      key
    );

  return (
    normalized.includes("authorization") ||
    normalized.includes("authentication") ||
    normalized.includes("authkey") ||
    normalized.includes("authtoken") ||
    normalized.includes("apikey") ||
    normalized.includes("cookie") ||
    normalized.includes("phone") ||
    normalized.includes("token") ||
    normalized.includes("password") ||
    normalized.includes("secret") ||
    normalized.includes("credential") ||
    normalized.startsWith("auth") ||
    (!isSessionMetric && normalized.startsWith("session")) ||
    normalized.startsWith("identity") ||
    isPrivyCredential
  );
}

function redactSensitiveText(value: string) {
  return value
    .replace(BEARER_OR_BASIC_CREDENTIAL, "$1 " + REDACTED)
    .replace(SENSITIVE_ASSIGNMENT, (match) => {
      const separator = match.search(/[:=]/);
      return `${match.slice(0, separator + 1)}${REDACTED}`;
    })
    .replace(SENSITIVE_QUERY_PARAMETER, `$1${REDACTED}`)
    .replace(INTERNATIONAL_PHONE, REDACTED)
    .replace(NORTH_AMERICAN_PHONE, REDACTED);
}

function sanitizeValue<T>(value: T, seen: WeakMap<object, unknown>): T {
  if (typeof value === "string") return redactSensitiveText(value) as T;
  if (value === null || typeof value !== "object") return value;

  const existing = seen.get(value);
  if (existing) return existing as T;

  // Error message/stack are non-enumerable and Date/Map/Set carry no
  // enumerable entries, so the generic Object.entries walk below would
  // flatten them all to {}.
  if (value instanceof Date) return new Date(value.getTime()) as T;

  if (value instanceof Error) {
    const sanitized: Record<string, unknown> = {
      name: value.name,
      message: redactSensitiveText(value.message),
    };
    seen.set(value, sanitized);
    if (typeof value.stack === "string") {
      sanitized.stack = redactSensitiveText(value.stack);
    }
    for (const [key, nestedValue] of Object.entries(value)) {
      sanitized[key] = isSensitiveKey(key)
        ? REDACTED
        : sanitizeValue(nestedValue, seen);
    }
    return sanitized as T;
  }

  if (value instanceof Map) {
    const sanitized: Record<string, unknown> = {};
    seen.set(value, sanitized);
    for (const [key, nestedValue] of value.entries()) {
      const normalizedKey = String(key);
      sanitized[normalizedKey] = isSensitiveKey(normalizedKey)
        ? REDACTED
        : sanitizeValue(nestedValue, seen);
    }
    return sanitized as T;
  }

  if (value instanceof Set) {
    const sanitized: unknown[] = [];
    seen.set(value, sanitized);
    for (const item of value.values()) {
      sanitized.push(sanitizeValue(item, seen));
    }
    return sanitized as T;
  }

  if (Array.isArray(value)) {
    const sanitized: unknown[] = [];
    seen.set(value, sanitized);
    for (const item of value) sanitized.push(sanitizeValue(item, seen));
    return sanitized as T;
  }

  const sanitized: Record<string, unknown> = {};
  seen.set(value, sanitized);

  for (const [key, nestedValue] of Object.entries(value)) {
    sanitized[key] = isSensitiveKey(key)
      ? REDACTED
      : sanitizeValue(nestedValue, seen);
  }

  return sanitized as T;
}

/**
 * Returns a structurally identical, telemetry-safe copy without mutating the
 * payload that application code still owns.
 */
export function sanitizeTelemetryPayload<T>(payload: T): T {
  return sanitizeValue(payload, new WeakMap());
}

/** Shared Sentry privacy hooks for browser, Node.js, and edge runtimes. */
export const sentryPrivacyOptions = {
  sendDefaultPii: false,
  dataCollection: {
    userInfo: false,
    cookies: false,
    httpHeaders: { request: false, response: false },
    httpBodies: [],
    urlQueryParams: false,
    graphQL: { document: false, variables: false },
    genAI: { inputs: false, outputs: false },
    databaseQueryData: false,
    stackFrameVariables: false,
    frameContextLines: 0,
  },
  beforeBreadcrumb: (breadcrumb: Breadcrumb) =>
    sanitizeTelemetryPayload(breadcrumb),
  beforeSend: (event: ErrorEvent) => sanitizeTelemetryPayload(event),
  beforeSendTransaction: <T>(event: T) => sanitizeTelemetryPayload(event),
  beforeSendSpan: <T>(span: T) => sanitizeTelemetryPayload(span),
  beforeSendLog: (log: Log) => sanitizeTelemetryPayload(log),
};
