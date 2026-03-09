import { NextRequest } from "next/server";

/** Verify the x-agent-secret header matches the configured secret. */
export function verifyAgentSecret(request: NextRequest): boolean {
  return (
    request.headers.get("x-agent-secret") === process.env.AGENT_CYCLE_SECRET
  );
}

/** Derive the app's base URL from env or the incoming request. */
export function getBaseUrl(request: NextRequest): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ??
    `${request.nextUrl.protocol}//${request.nextUrl.host}`
  );
}
