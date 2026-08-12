"use client";

import { useLogin, usePrivy, useWallets } from "@privy-io/react-auth";
import { useCallback, useRef, useState } from "react";
import { formatDeskDollarsBalanceLabel } from "@/lib/desk-dollars";
import { getEvmWalletAddress } from "@/lib/privy/wallet";
import { formatShortAddress } from "@/lib/utils";
import { useDeskDollarsBalance } from "@/hooks/use-desk-dollars-balance";
import { getAuthBoundaryState } from "./auth-boundary";

/**
 * Compact shell auth: login/logout, truncated wallet, and live tUSD balance.
 * Does not gate children — use AuthGate for signed-in-only surfaces.
 */
export function AuthControls() {
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
  const { balance, decimals } = useDeskDollarsBalance(
    authenticated && walletAddress ? walletAddress : null
  );
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

  const balanceLabel = formatDeskDollarsBalanceLabel(balance, decimals);

  return (
    <div
      className="flex flex-wrap items-center justify-end gap-3"
      data-testid="auth-controls"
    >
      <p aria-live="polite" className="text-xs text-[var(--t-muted)]">
        {state.message}
      </p>
      {walletAddress &&
      (state.status === "signed-in" || state.status === "logout-error") ? (
        <div className="flex flex-wrap items-center gap-2 text-xs tabular-nums">
          <span className="text-[var(--t-text)]">
            {formatShortAddress(walletAddress)}
          </span>
          {balanceLabel ? (
            <span className="text-[var(--t-green-hot)]">{balanceLabel}</span>
          ) : null}
        </div>
      ) : null}
      {state.action === "login" ? (
        <button
          className="rounded-sm bg-[var(--t-accent)] px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-[var(--t-bg)]"
          onClick={handleLogin}
          type="button"
        >
          Continue with phone
        </button>
      ) : null}
      {state.action === "logout" ? (
        <button
          className="rounded-sm border border-[var(--t-muted)] px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-[var(--t-text)]"
          onClick={handleLogout}
          type="button"
        >
          Log out
        </button>
      ) : null}
    </div>
  );
}
