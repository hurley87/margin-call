import type { Event, EventHint } from "@sentry/nextjs";

type RuntimeEnvironment = "development" | "production" | "test";

/**
 * Resolves the Sentry environment value from runtime process state.
 * Defaults to development for local and preview-like executions.
 */
export const resolveSentryEnvironment = (
  nodeEnv: string | undefined,
): RuntimeEnvironment => {
  if (nodeEnv === "production") {
    return "production";
  }

  if (nodeEnv === "test") {
    return "test";
  }

  return "development";
};

/**
 * Enables Sentry transport only for production runtime.
 */
export const isSentryEnabled = (nodeEnv: string | undefined): boolean =>
  resolveSentryEnvironment(nodeEnv) === "production";

const isLoopbackHost = (hostname: string): boolean => {
  const normalizedHost = hostname.toLowerCase();
  const unbracketedHost = normalizedHost.replace(/^\[(.*)\]$/, "$1");

  return (
    unbracketedHost === "localhost" ||
    unbracketedHost === "127.0.0.1" ||
    unbracketedHost === "::1"
  );
};

/**
 * Determines whether a URL is local/loopback and should be excluded.
 */
export const isLocalUrl = (url: string | undefined): boolean => {
  if (!url) {
    return false;
  }

  try {
    const parsedUrl = new URL(url);
    return isLoopbackHost(parsedUrl.hostname);
  } catch {
    return false;
  }
};

/**
 * Drops non-production and localhost/loopback events before ingestion.
 */
export const beforeSendFilter = (
  nodeEnv: string | undefined,
): ((event: Event, hint: EventHint) => Event | null) => {
  const environment = resolveSentryEnvironment(nodeEnv);

  return (event) => {
    if (environment !== "production") {
      return null;
    }

    const eventUrl = event.request?.url;
    if (isLocalUrl(eventUrl)) {
      return null;
    }

    return event;
  };
};
