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

export function getConvexUrl(url: string | undefined): string {
  if (!url) {
    throw new Error(
      "Missing NEXT_PUBLIC_CONVEX_URL. Set it to the Convex deployment URL before starting Margin Call."
    );
  }

  return url;
}
