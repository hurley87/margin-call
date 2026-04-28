import "server-only";

import { ConvexHttpClient } from "convex/browser";

/**
 * Returns a server-side Convex HTTP client configured with the deploy key so
 * that internal functions (internalMutation / internalQuery) can be called
 * from Next.js API routes.
 *
 * `setAdminAuth` is an undocumented (but stable) method on ConvexHttpClient that
 * accepts the Convex deploy key and grants access to internal functions.
 *
 * Required env vars:
 *   NEXT_PUBLIC_CONVEX_URL   — deployment URL (shared with browser client)
 *   CONVEX_DEPLOY_KEY        — secret deploy key (never exposed to the browser)
 */
export function createConvexAdminClient(): ConvexHttpClient {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!url) {
    throw new Error(
      "NEXT_PUBLIC_CONVEX_URL is not set. Add it to your .env.local file."
    );
  }

  const deployKey = process.env.CONVEX_DEPLOY_KEY;
  if (!deployKey) {
    throw new Error(
      "CONVEX_DEPLOY_KEY is not set. Add it to your .env.local file."
    );
  }

  const client = new ConvexHttpClient(url);
  // setAdminAuth exists at runtime but is not in the public TypeScript API;
  // it is required to call internal Convex functions from outside Convex.
  (client as unknown as { setAdminAuth(token: string): void }).setAdminAuth(
    deployKey
  );
  return client;
}
