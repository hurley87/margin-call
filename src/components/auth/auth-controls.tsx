"use client";

import { useLogin, usePrivy, useWallets } from "@privy-io/react-auth";
import { useCallback, useRef, useState } from "react";
import { FlashValue } from "@/components/ui/flash-value";
import { WalletDialog } from "@/components/wallet/wallet-dialog";
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
  const [walletOpen, setWalletOpen] = useState(false);
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
    setWalletOpen(false);

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
  const signedInWallet =
    walletAddress &&
    (state.status === "signed-in" || state.status === "logout-error")
      ? walletAddress
      : null;

  return (
    <div
      className="flex flex-wrap items-center justify-end gap-3"
      data-testid="auth-controls"
    >
      <p aria-live="polite" className="text-xs text-[var(--t-muted)]">
        {state.message}
      </p>
      {signedInWallet ? (
        <>
          <button
            aria-expanded={walletOpen}
            aria-haspopup="dialog"
            className="flex flex-wrap items-center gap-2 rounded-sm border border-transparent px-2 py-1 text-xs tabular-nums text-[var(--t-text)] transition-colors hover:border-[var(--t-accent)] hover:text-[var(--t-accent)] focus-visible:border-[var(--t-accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--t-accent)]"
            data-testid="wallet-chip"
            onClick={() => setWalletOpen(true)}
            type="button"
          >
            <span>{formatShortAddress(signedInWallet)}</span>
            {balanceLabel && balance !== null ? (
              <FlashValue className="text-[var(--t-green-hot)]" value={balance}>
                {balanceLabel}
              </FlashValue>
            ) : null}
          </button>
          <WalletDialog
            balance={balance}
            decimals={decimals}
            onOpenChange={setWalletOpen}
            open={walletOpen}
            walletAddress={signedInWallet}
          />
        </>
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
