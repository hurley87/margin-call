import { describe, expect, it } from "vitest";
import { getAuthBoundaryState } from "@/components/auth/auth-boundary";

describe("authentication boundary", () => {
  it("waits for Privy to restore a returning session before offering an action", () => {
    expect(
      getAuthBoundaryState({
        privyReady: false,
        authenticated: false,
        walletsReady: false,
        walletAddress: null,
        loginError: false,
        logoutPending: false,
        logoutError: false,
      })
    ).toEqual({
      status: "restoring",
      message: "Restoring your session…",
      action: null,
    });
  });

  it("offers phone sign-in after Privy confirms there is no session", () => {
    expect(
      getAuthBoundaryState({
        privyReady: true,
        authenticated: false,
        walletsReady: false,
        walletAddress: null,
        loginError: false,
        logoutPending: false,
        logoutError: false,
      })
    ).toEqual({
      status: "logged-out",
      message: "Sign in with your phone to continue.",
      action: "login",
    });
  });

  it("shows wallet setup feedback after authentication and keeps logout reachable", () => {
    expect(
      getAuthBoundaryState({
        privyReady: true,
        authenticated: true,
        walletsReady: false,
        walletAddress: null,
        loginError: false,
        logoutPending: false,
        logoutError: false,
      })
    ).toEqual({
      status: "wallet-provisioning",
      message: "Setting up your wallet…",
      action: "logout",
    });
  });

  it("shows logout progress even while the wallet is still provisioning", () => {
    expect(
      getAuthBoundaryState({
        privyReady: true,
        authenticated: true,
        walletsReady: false,
        walletAddress: null,
        loginError: false,
        logoutPending: true,
        logoutError: false,
      })
    ).toEqual({
      status: "logout-pending",
      message: "Signing out…",
      action: null,
    });
  });

  it("shows a signed-in state only after the embedded EVM wallet is ready", () => {
    expect(
      getAuthBoundaryState({
        privyReady: true,
        authenticated: true,
        walletsReady: true,
        walletAddress: "0x1234",
        loginError: false,
        logoutPending: false,
        logoutError: false,
      })
    ).toEqual({
      status: "signed-in",
      message: "",
      action: "logout",
    });
  });

  it("returns a cancelled or failed login to a retryable phone sign-in state", () => {
    expect(
      getAuthBoundaryState({
        privyReady: true,
        authenticated: false,
        walletsReady: false,
        walletAddress: null,
        loginError: true,
        logoutPending: false,
        logoutError: false,
      })
    ).toEqual({
      status: "login-error",
      message: "Sign-in was cancelled or unavailable. Try again.",
      action: "login",
    });
  });

  it("removes the logout action while a logout is pending", () => {
    expect(
      getAuthBoundaryState({
        privyReady: true,
        authenticated: true,
        walletsReady: true,
        walletAddress: "0x1234",
        loginError: false,
        logoutPending: true,
        logoutError: false,
      })
    ).toEqual({
      status: "logout-pending",
      message: "Signing out…",
      action: null,
    });
  });

  it("keeps the signed-in state and restores logout retry after a logout failure", () => {
    expect(
      getAuthBoundaryState({
        privyReady: true,
        authenticated: true,
        walletsReady: true,
        walletAddress: "0x1234",
        loginError: false,
        logoutPending: false,
        logoutError: true,
      })
    ).toEqual({
      status: "logout-error",
      message: "We couldn't sign you out. Please try again.",
      action: "logout",
    });
  });
});
