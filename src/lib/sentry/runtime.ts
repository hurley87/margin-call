export type SentryEventLike = {
  request?: {
    url?: string | null;
  } | null;
};

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0"]);

const isLoopbackHostname = (hostname: string): boolean => {
  if (LOOPBACK_HOSTS.has(hostname)) {
    return true;
  }

  if (hostname.endsWith(".localhost")) {
    return true;
  }

  return hostname.startsWith("127.");
};

export const isLocalhostUrl = (url: string): boolean => {
  try {
    const parsedUrl = new URL(url);
    return isLoopbackHostname(parsedUrl.hostname);
  } catch {
    return false;
  }
};

export const filterLocalhostEvent = <T extends SentryEventLike>(
  event: T,
): T | null => {
  const requestUrl = event.request?.url;
  if (!requestUrl) {
    return event;
  }

  return isLocalhostUrl(requestUrl) ? null : event;
};

export const getSentryEnvironment = (
  nodeEnv = process.env.NODE_ENV,
  vercelEnv = process.env.VERCEL_ENV,
): string => {
  if (vercelEnv === "production") {
    return "production";
  }

  if (vercelEnv === "preview") {
    return "vercel-preview";
  }

  if (nodeEnv === "production") {
    return "production";
  }

  return "development";
};

export const isSentryEnabled = (
  nodeEnv = process.env.NODE_ENV,
  vercelEnv = process.env.VERCEL_ENV,
): boolean => {
  if (nodeEnv !== "production") {
    return false;
  }

  if (vercelEnv && vercelEnv !== "production") {
    return false;
  }

  return true;
};
