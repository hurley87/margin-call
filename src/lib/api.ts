import { getAccessToken } from "@privy-io/react-auth";

export async function authFetch(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  const token = await getAccessToken();
  return fetch(input, {
    ...init,
    headers: {
      ...init?.headers,
      Authorization: `Bearer ${token}`,
    },
  });
}

/**
 * Persists the authenticated desk wallet's USDC balance to Convex so that
 * server-side hire/deal gates use durable state. Throws with the server's
 * error string (or `fallbackError`) if the sync fails.
 */
export async function syncDeskWalletBalance(
  fallbackError: string
): Promise<void> {
  const res = await authFetch("/api/desk/sync-wallet-balance", {
    method: "POST",
  });
  if (res.ok) return;
  const body = await res.json().catch(() => ({}));
  throw new Error((body as { error?: string }).error ?? fallbackError);
}
