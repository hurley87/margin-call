/**
 * Keep Sentry ingestion focused on deployed environments.
 * Local dev Fast Refresh can emit transient errors which are not production incidents.
 */
export function isSentryEnabled(nodeEnv: string | undefined): boolean {
  return nodeEnv === "production";
}
