"use client";

import {
  isDeeplinkWalletProvider,
  isWalletAccountVerified,
  type WalletAccount,
  type WalletProviderData,
} from "@dynamic-labs-sdk/client";
import {
  useConnectWithWalletProvider,
  useGetAvailableWalletProvidersData,
  useLogout,
  useVerifyWalletAccount,
} from "@dynamic-labs-sdk/react-hooks";
import { useState, type ReactNode } from "react";
import { DrawablyCard } from "drawably/react";
import { SketchButton as Button } from "@/components/ui/sketch-button";
import {
  useWalletSession,
  type WalletSession,
} from "@/components/wallet/wallet-providers";
import { connectThenVerifyWallet } from "@/lib/dynamic/connect-then-verify";
import { formatShortAddress } from "@/lib/utils";

type ActionableView =
  | { kind: "idle" }
  | { kind: "no-providers" }
  | { kind: "picking"; providers: WalletProviderData[] }
  | { kind: "connected"; address: `0x${string}` }
  | { kind: "needs-signature"; address: `0x${string}`; account: WalletAccount };

type WalletView =
  { kind: "preparing" } | { kind: "failed"; message: string } | ActionableView;

function derivePickerView(evmProviders: WalletProviderData[]): ActionableView {
  if (evmProviders.length === 0) {
    return { kind: "no-providers" };
  }
  return { kind: "picking", providers: evmProviders };
}

/**
 * The picker stays mounted for the whole connect → SIWE sequence. The session
 * flips to `connected` the moment pairing lands, so rendering the connected
 * view mid-handshake would flash Sign in at a wallet about to auto-verify.
 */
function deriveWalletView(args: {
  session: WalletSession;
  isPickerOpen: boolean;
  evmAccount: WalletAccount | null;
  evmProviders: WalletProviderData[];
}): WalletView {
  const { session, isPickerOpen, evmAccount, evmProviders } = args;

  switch (session.kind) {
    case "unset":
    case "hydrating":
      return { kind: "preparing" };
    case "failed":
      return { kind: "failed", message: session.message };
    case "disconnected":
      return isPickerOpen ? derivePickerView(evmProviders) : { kind: "idle" };
    case "connected": {
      if (isPickerOpen) {
        return derivePickerView(evmProviders);
      }
      if (
        evmAccount &&
        !isWalletAccountVerified({ walletAccount: evmAccount })
      ) {
        return {
          kind: "needs-signature",
          address: session.address,
          account: evmAccount,
        };
      }
      return { kind: "connected", address: session.address };
    }
    default: {
      const _exhaustive: never = session;
      return _exhaustive;
    }
  }
}

function statusCopy(args: {
  isConnecting: boolean;
  isVerifying: boolean;
}): string | null {
  if (args.isVerifying) return "Confirm the signature in your wallet.";
  if (args.isConnecting) return "Approve the connection in your wallet.";
  return null;
}

/** Wallet UI that assumes Dynamic hooks are available in the tree. */
export function WalletConnectUi(props: {
  evmAccount: WalletAccount | null;
  compact?: boolean;
  children?: ReactNode;
}) {
  const { evmAccount } = props;
  const session = useWalletSession();
  const { data: providers = [] } = useGetAvailableWalletProvidersData();
  const {
    mutateAsync: connect,
    isPending: isConnecting,
    error: connectError,
    reset: resetConnect,
  } = useConnectWithWalletProvider();
  const {
    mutateAsync: verify,
    isPending: isVerifying,
    error: verifyError,
    reset: resetVerify,
  } = useVerifyWalletAccount();
  const {
    mutate: logout,
    isPending: isLoggingOut,
    error: logoutError,
    reset: resetLogout,
  } = useLogout();
  const [isPickerOpen, setIsPickerOpen] = useState(false);

  const evmProviders = providers.filter((provider) => provider.chain === "EVM");
  const errorMessage =
    connectError?.message ??
    verifyError?.message ??
    logoutError?.message ??
    null;
  const prompt = statusCopy({ isConnecting, isVerifying });

  const resetFlow = () => {
    resetConnect();
    resetVerify();
    resetLogout();
  };

  const signIn = async (walletAccount: WalletAccount) => {
    resetFlow();
    try {
      await verify({ walletAccount });
    } catch {
      // Verify errors surface through the mutation error state.
    }
  };

  const connectProvider = async (provider: WalletProviderData) => {
    resetFlow();
    try {
      await connectThenVerifyWallet({
        walletProviderKey: provider.key,
        isDeeplinkProvider: isDeeplinkWalletProvider({
          walletProvider: provider,
        }),
        connect,
        verify,
      });
      setIsPickerOpen(false);
    } catch {
      // Connect/verify errors surface through the mutation error state.
    }
  };

  const view = deriveWalletView({
    session,
    isPickerOpen,
    evmAccount,
    evmProviders,
  });

  if (view.kind === "preparing") {
    return (
      <p className="text-xs uppercase tracking-[0.2em] text-[var(--t-muted)]">
        Preparing wallet…
      </p>
    );
  }
  if (view.kind === "failed") {
    return (
      <p className="max-w-xs text-xs leading-5 text-[var(--t-muted)]">
        {view.message}
      </p>
    );
  }

  const disconnectButton = (
    <Button
      type="button"
      variant="outline"
      className="w-fit"
      disabled={isLoggingOut}
      onClick={() => {
        resetFlow();
        logout();
      }}
    >
      Disconnect
    </Button>
  );

  const renderBody = (actionable: ActionableView) => {
    switch (actionable.kind) {
      case "idle":
        return (
          <Button
            type="button"
            variant="outline"
            className="w-fit"
            onClick={() => {
              resetFlow();
              setIsPickerOpen(true);
            }}
          >
            Connect
          </Button>
        );
      case "no-providers":
        return (
          <p className="max-w-xs text-xs leading-5 text-[var(--t-muted)]">
            Install an EVM wallet extension to connect.
          </p>
        );
      case "picking":
        return (
          <>
            <ul className="flex w-full max-w-xs flex-col gap-2">
              {actionable.providers.map((provider) => (
                <li key={provider.key}>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    disabled={isConnecting || isVerifying}
                    onClick={() => void connectProvider(provider)}
                  >
                    {provider.metadata.displayName}
                  </Button>
                </li>
              ))}
            </ul>
            {prompt ? (
              <p className="max-w-xs text-xs leading-5 text-[var(--t-muted)]">
                {prompt}
              </p>
            ) : null}
          </>
        );
      case "connected":
        return (
          <>
            <p className="font-mono text-sm text-[var(--t-text)]">
              {formatShortAddress(actionable.address)}
            </p>
            {disconnectButton}
          </>
        );
      case "needs-signature":
        return (
          <>
            <p className="font-mono text-sm text-[var(--t-text)]">
              {formatShortAddress(actionable.address)}
            </p>
            <div className="flex flex-col gap-2">
              <p className="max-w-xs text-xs leading-5 text-[var(--t-muted)]">
                {prompt ?? "Sign in your wallet to finish connecting."}
              </p>
              <Button
                type="button"
                variant="outline"
                className="w-fit"
                disabled={isVerifying}
                onClick={() => void signIn(actionable.account)}
              >
                {isVerifying ? "Waiting for signature…" : "Sign in"}
              </Button>
            </div>
            {disconnectButton}
          </>
        );
      default: {
        const _exhaustive: never = actionable;
        return _exhaustive;
      }
    }
  };

  if (props.compact && view.kind !== "idle") {
    const connected = view.kind === "connected";
    const label = connected
      ? formatShortAddress(view.address)
      : isVerifying
        ? "Signing…"
        : isConnecting
          ? "Connecting…"
          : view.kind === "needs-signature"
            ? "Sign in"
            : "Connect wallet";
    return (
      <details
        className="wallet-account"
        open={!connected}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.currentTarget.open = false;
            event.currentTarget.querySelector("summary")?.focus();
          }
        }}
      >
        <summary
          className="wallet-address-pill"
          aria-label={
            connected
              ? `Account controls for ${formatShortAddress(view.address)}`
              : "Wallet connection controls"
          }
        >
          <svg className="wallet-avatar" viewBox="0 0 32 32" aria-hidden="true">
            <circle cx="16" cy="16" r="16" fill="currentColor" />
            <circle cx="16" cy="12" r="5" fill="white" />
            <path d="M7 26c0-10 18-10 18 0" fill="white" />
          </svg>
          <span>{label}</span>
          <svg
            className="wallet-chevron"
            viewBox="0 0 20 20"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden="true"
          >
            <path d="m4 7 6 6 6-6" />
          </svg>
        </summary>
        <DrawablyCard
          className="wallet-account-panel"
          seed={24}
          roughness={0.7}
          boil={0}
        >
          {connected ? disconnectButton : renderBody(view)}
          {props.children}
          {errorMessage ? <p role="alert">{errorMessage}</p> : null}
        </DrawablyCard>
      </details>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {renderBody(view)}
      {props.children}
      {errorMessage ? (
        <p className="text-xs text-[var(--t-muted)]">{errorMessage}</p>
      ) : null}
    </div>
  );
}
