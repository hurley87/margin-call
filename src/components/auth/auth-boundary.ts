export type AuthBoundaryInput = {
  privyReady: boolean;
  authenticated: boolean;
  walletsReady: boolean;
  walletAddress: `0x${string}` | null;
  // Only surfaces that own login/logout actions (AuthControls) have these;
  // read-only consumers like AuthGate omit them.
  loginError?: boolean;
  logoutPending?: boolean;
  logoutError?: boolean;
};

export type AuthBoundaryState = {
  status:
    | "restoring"
    | "logged-out"
    | "login-error"
    | "wallet-provisioning"
    | "signed-in"
    | "logout-pending"
    | "logout-error";
  /** Header live-region copy; null when chrome should stay quiet. */
  message: string | null;
  /** Header CTA only — dialog owns logout when a wallet chip is available. */
  action: "login" | "logout" | null;
};

export function getAuthBoundaryState(
  input: AuthBoundaryInput
): AuthBoundaryState {
  if (!input.privyReady) {
    return {
      status: "restoring",
      message: "Restoring your session…",
      action: null,
    };
  }

  if (input.authenticated && input.logoutPending) {
    return {
      status: "logout-pending",
      message: "Signing out…",
      action: null,
    };
  }

  if (input.authenticated && input.logoutError) {
    return {
      status: "logout-error",
      message: "We couldn't sign you out. Please try again.",
      // Wallet chip + dialog own retry when an address is available.
      action: input.walletAddress ? null : "logout",
    };
  }

  // Provisioning can stall forever (embedded-wallet creation failed, or the
  // account only has an external wallet), so logout must stay reachable.
  if (input.authenticated && (!input.walletsReady || !input.walletAddress)) {
    return {
      status: "wallet-provisioning",
      message: "Setting up your wallet…",
      action: "logout",
    };
  }

  if (input.authenticated) {
    return {
      status: "signed-in",
      message: null,
      action: null,
    };
  }

  if (input.loginError) {
    return {
      status: "login-error",
      message: "Sign-in was cancelled or unavailable. Try again.",
      action: "login",
    };
  }

  return {
    status: "logged-out",
    message: "Sign in with your phone to continue.",
    action: "login",
  };
}
