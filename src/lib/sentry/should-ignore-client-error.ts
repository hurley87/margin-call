type EventLike = {
  environment?: string;
  message?: string;
  transaction?: string;
  request?: { url?: string };
  tags?: Record<string, unknown>;
  exception?: {
    values?: Array<{
      type?: string;
      value?: string;
      stacktrace?: {
        frames?: Array<{
          function?: string;
          filename?: string;
        }>;
      };
    }>;
  };
};

const DEV_ENVIRONMENTS = new Set(["development", "dev"]);
const LOOPBACK_URL_PATTERN = /^https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0)(?::\d+)?\//i;
const KNOWN_DEV_REFERENCE_ERROR_PATTERN =
  /^ReferenceError: (?:useDepositFlow|useDeals|nameTaken|openDeals|walletAddress|getSource) is not defined$/;
const HOOK_ORDER_ERROR_SNIPPET = "Rendered more hooks than during the previous render";

function getPrimaryException(event: EventLike) {
  return event.exception?.values?.[0];
}

function getEventMessage(event: EventLike): string {
  if (typeof event.message === "string" && event.message.trim().length > 0) {
    return event.message.trim();
  }

  const exception = getPrimaryException(event);
  const type = exception?.type?.trim();
  const value = exception?.value?.trim();

  if (type && value) return `${type}: ${value}`;
  return type ?? value ?? "";
}

function getEventUrls(event: EventLike): string[] {
  const urls = [
    event.request?.url,
    typeof event.tags?.url === "string" ? event.tags.url : undefined,
  ];

  return urls.filter((url): url is string => Boolean(url));
}

function getStackFunctions(event: EventLike): string[] {
  const frames = getPrimaryException(event)?.stacktrace?.frames ?? [];
  return frames
    .map((frame) => frame.function)
    .filter((value): value is string => Boolean(value))
    .map((value) => value.toLowerCase());
}

function isDevelopmentEvent(event: EventLike): boolean {
  const eventEnvironment = event.environment?.toLowerCase();
  if (eventEnvironment && DEV_ENVIRONMENTS.has(eventEnvironment)) {
    return true;
  }

  return process.env.NODE_ENV === "development";
}

function hasDevRefreshSignal(event: EventLike): boolean {
  const hasLocalhostUrl = getEventUrls(event).some((url) =>
    LOOPBACK_URL_PATTERN.test(url)
  );
  if (hasLocalhostUrl) return true;

  const stackFunctions = getStackFunctions(event);
  return stackFunctions.some(
    (name) => name.includes("performreactrefresh") || name.includes("schedulerefresh")
  );
}

/**
 * Drops known noisy browser errors that only happen during local Fast Refresh.
 * This keeps local iteration noise out of Sentry while preserving production signals.
 */
export function shouldIgnoreDevClientError(event: EventLike): boolean {
  if (!isDevelopmentEvent(event)) return false;

  const message = getEventMessage(event);
  if (!message) return false;

  const isKnownReferenceError = KNOWN_DEV_REFERENCE_ERROR_PATTERN.test(message);
  const isHookOrderError = message.includes(HOOK_ORDER_ERROR_SNIPPET);
  if (!isKnownReferenceError && !isHookOrderError) return false;

  return hasDevRefreshSignal(event);
}
