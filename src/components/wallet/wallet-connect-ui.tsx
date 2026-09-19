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
import { DrawablyButton, DrawablyCard } from "drawably/react";
import { SKETCH } from "@/components/ui/sketch";
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

/**
 * What the dropdown is showing.
 *
 * `connecting` is distinct from `account` because it must survive the connect →
 * SIWE gap: the session flips to connected the moment pairing lands, so an
 * account view here would flash Sign in at a wallet about to auto-verify.
 */
type PanelState = "closed" | "connecting" | "account";

function derivePickerView(evmProviders: WalletProviderData[]): ActionableView {
  if (evmProviders.length === 0) {
    return { kind: "no-providers" };
  }
  return { kind: "picking", providers: evmProviders };
}

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

function summaryLabel(args: {
  view: ActionableView;
  isConnecting: boolean;
  isVerifying: boolean;
}): string {
  if (args.view.kind === "connected") {
    return formatShortAddress(args.view.address);
  }
  if (args.isVerifying) return "Signing…";
  if (args.isConnecting) return "Connecting…";
  if (args.view.kind === "needs-signature") return "Sign in";
  // Kept short: the pill narrows to 155px on small screens and never wraps.
  return "Connect";
}

/** Wallet UI that assumes Dynamic hooks are available in the tree. */
export function WalletConnectUi(props: {
  evmAccount: WalletAccount | null;
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
  const [panel, setPanel] = useState<PanelState>("closed");

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
      setPanel("closed");
    } catch {
      // Connect/verify errors surface through the mutation error state.
    }
  };

  const view = deriveWalletView({
    session,
    isPickerOpen: panel === "connecting",
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

  // The wallet still owes us an action, so the panel is not dismissable yet.
  const isPinnedOpen =
    isConnecting || isVerifying || view.kind === "needs-signature";
  const isOpen = isPinnedOpen || panel !== "closed";

  const startPicking = () => {
    resetFlow();
    setPanel("connecting");
  };

  const disconnectButton = (
    <DrawablyButton
      {...SKETCH}
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
    </DrawablyButton>
  );

  const renderBody = (actionable: ActionableView) => {
    switch (actionable.kind) {
      case "idle":
        return (
          <DrawablyButton
            {...SKETCH}
            type="button"
            variant="outline"
            className="w-fit"
            onClick={startPicking}
          >
            Connect
          </DrawablyButton>
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
                  <DrawablyButton
                    {...SKETCH}
                    type="button"
                    variant="outline"
                    className="w-full"
                    disabled={isConnecting || isVerifying}
                    onClick={() => void connectProvider(provider)}
                  >
                    {provider.metadata.displayName}
                  </DrawablyButton>
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
        return disconnectButton;
      case "needs-signature":
        return (
          <>
            <div className="flex flex-col gap-2">
              <p className="max-w-xs text-xs leading-5 text-[var(--t-muted)]">
                {prompt ?? "Sign in your wallet to finish connecting."}
              </p>
              <DrawablyButton
                {...SKETCH}
                type="button"
                variant="outline"
                className="w-fit"
                disabled={isVerifying}
                onClick={() => void signIn(actionable.account)}
              >
                {isVerifying ? "Waiting for signature…" : "Sign in"}
              </DrawablyButton>
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

  return (
    <details
      className="wallet-account"
      open={isOpen}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          setPanel("closed");
          event.currentTarget.querySelector("summary")?.focus();
        }
      }}
    >
      <summary
        className="wallet-address-pill"
        aria-label={
          view.kind === "connected"
            ? `Account controls for ${formatShortAddress(view.address)}`
            : "Wallet connection controls"
        }
        // React owns `open`, so suppress the native toggle and drive the state.
        onClick={(event) => {
          event.preventDefault();
          if (isOpen) {
            setPanel("closed");
          } else if (view.kind === "connected") {
            setPanel("account");
          } else {
            startPicking();
          }
        }}
      >
        <svg className="wallet-avatar" viewBox="0 0 32 32" aria-hidden="true">
          <circle cx="16" cy="16" r="16" fill="currentColor" />
          <circle cx="16" cy="12" r="5" fill="white" />
          <path d="M7 26c0-10 18-10 18 0" fill="white" />
        </svg>
        <span>{summaryLabel({ view, isConnecting, isVerifying })}</span>
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
      <DrawablyCard {...SKETCH} seed={24} className="wallet-account-panel">
        {renderBody(view)}
        {props.children}
        {errorMessage ? <p role="alert">{errorMessage}</p> : null}
      </DrawablyCard>
    </details>
  );
}
