"use client";

import { useLogin, usePrivy, useWallets } from "@privy-io/react-auth";
import { useCallback, useRef, useState } from "react";
import { getEvmWalletAddress } from "@/lib/privy/wallet";
import { getAuthBoundaryState } from "./auth-boundary";

export function AuthGate({
  children,
}: Readonly<{
  children?: React.ReactNode;
}>) {
  const { ready: privyReady, authenticated, logout, user } = usePrivy();
  const { ready: walletsReady } = useWallets();
  const [loginError, setLoginError] = useState(false);
  const [logoutPending, setLogoutPending] = useState(false);
  const [logoutError, setLogoutError] = useState(false);
  const logoutInFlight = useRef(false);
  const { login } = useLogin({
    onError: () => setLoginError(true),
  });
  const walletAddress = getEvmWalletAddress(user);
  const state = getAuthBoundaryState({
    privyReady,
    authenticated,
    walletsReady,
    walletAddress,
    loginError,
    logoutPending,
    logoutError,
  });

  const handleLogin = useCallback(() => {
    setLoginError(false);
    login();
  }, [login]);

  const handleLogout = useCallback(async () => {
    if (logoutInFlight.current) return;

    logoutInFlight.current = true;
    setLogoutError(false);
    setLogoutPending(true);

    try {
      await logout();
    } catch {
      setLogoutError(true);
    } finally {
      logoutInFlight.current = false;
      setLogoutPending(false);
    }
  }, [logout]);

  return (
    <>
      <p aria-live="polite" className="mt-8 text-sm text-[var(--t-text)]">
        {state.message}
      </p>
      {walletAddress &&
      (state.status === "signed-in" || state.status === "logout-error") ? (
        <p className="mt-2 break-all text-xs text-[var(--t-muted)]">
          Wallet: {walletAddress}
        </p>
      ) : null}
      {state.status === "signed-in" ? children : null}
      {state.action === "login" ? (
        <button
          className="mt-6 rounded-sm bg-[var(--t-accent)] px-5 py-3 text-sm font-bold uppercase tracking-wide text-[var(--t-bg)]"
          onClick={handleLogin}
          type="button"
        >
          Continue with phone
        </button>
      ) : null}
      {state.action === "logout" ? (
        <button
          className="mt-6 rounded-sm border border-[var(--t-muted)] px-5 py-3 text-sm font-bold uppercase tracking-wide text-[var(--t-text)]"
          onClick={handleLogout}
          type="button"
        >
          Log out
        </button>
      ) : null}
    </>
  );
}
