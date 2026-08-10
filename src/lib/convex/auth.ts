type ConvexTokenFetchArgs = {
  forceRefreshToken: boolean;
};

type PrivyAuthState = {
  ready: boolean;
  authenticated: boolean;
  getAccessToken: () => Promise<string | null>;
};

export type ConvexAuthProvider = {
  isLoading: boolean;
  isAuthenticated: boolean;
  fetchAccessToken: (args: ConvexTokenFetchArgs) => Promise<string | null>;
};

/**
 * Maps Privy's client state to Convex's auth-provider contract. The callback
 * deliberately asks Privy for a token per Convex request and never retains it.
 *
 * Privy's getAccessToken exposes no force-refresh option: it re-mints the JWT
 * itself whenever the cached one is expired or near expiry. A Convex
 * forceRefreshToken request therefore receives the freshest token Privy is
 * willing to produce, which is also the strongest guarantee available here.
 */
export function toConvexAuthProvider(
  privy: PrivyAuthState
): ConvexAuthProvider {
  return {
    isLoading: !privy.ready,
    isAuthenticated: privy.ready && privy.authenticated,
    fetchAccessToken: async () => privy.getAccessToken(),
  };
}
