"use client";

import { useLogin, usePrivy, useWallets } from "@privy-io/react-auth";
import { useCallback, useRef, useState } from "react";
import { getEvmWalletAddress } from "@/lib/privy/wallet";
import { getAuthBoundaryState } from "./auth-boundary";

export function AuthGate() {
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
    <main className="flex min-h-screen items-center justify-center bg-[var(--t-bg)] px-6 font-mono text-[var(--t-text)]">
      <div className="max-w-xl text-center">
        <p className="text-xs font-bold uppercase tracking-[0.28em] text-[var(--t-green)]">
          Margin Call
        </p>
        <h1 className="mt-4 font-[family-name:var(--font-plex-sans)] text-5xl font-black uppercase tracking-tight text-[var(--t-accent)] sm:text-7xl">
          Rebuilding
        </h1>
        <p className="mt-5 text-sm leading-6 text-[var(--t-muted)]">
          The next version is under construction.
        </p>
        <p aria-live="polite" className="mt-8 text-sm text-[var(--t-text)]">
          {state.message}
        </p>
        {walletAddress &&
        (state.status === "signed-in" || state.status === "logout-error") ? (
          <p className="mt-2 break-all text-xs text-[var(--t-muted)]">
            Wallet: {walletAddress}
          </p>
        ) : null}
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
      </div>
    </main>
  );
}
