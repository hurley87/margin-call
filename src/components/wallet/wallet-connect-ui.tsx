"use client";

import {
  isDeeplinkWalletProvider,
  isWalletAccountVerified,
  type WalletAccount,
  type WalletProviderData,
} from "@dynamic-labs-sdk/client";
import { isEvmWalletAccount } from "@dynamic-labs-sdk/evm";
import {
  useConnectWithWalletProvider,
  useGetAvailableWalletProvidersData,
  useGetWalletAccounts,
  useLogout,
  useVerifyWalletAccount,
} from "@dynamic-labs-sdk/react-hooks";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useWalletSession } from "@/components/wallet/wallet-providers";
import { connectThenVerifyWallet } from "@/lib/dynamic/connect-then-verify";
import { formatShortAddress } from "@/lib/utils";

type DisconnectedView =
  | { kind: "idle" }
  | { kind: "no-providers" }
  | { kind: "picking"; providers: WalletProviderData[] };

function deriveDisconnectedView(args: {
  isPickerOpen: boolean;
  evmProviders: WalletProviderData[];
}): DisconnectedView {
  if (!args.isPickerOpen) {
    return { kind: "idle" };
  }
  if (args.evmProviders.length === 0) {
    return { kind: "no-providers" };
  }
  return { kind: "picking", providers: args.evmProviders };
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
export function WalletConnectUi() {
  const session = useWalletSession();
  const { data: accounts = [] } = useGetWalletAccounts();
  const { data: providers = [] } = useGetAvailableWalletProvidersData();
  const {
    mutateAsync: connect,
    isPending: isConnecting,
    error: connectError,
    reset: resetConnect,
  } = useConnectWithWalletProvider();
  const {
    mutateAsync: verify,
    mutate: verifyWalletAccount,
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
  const evmAccount = accounts.find(isEvmWalletAccount) ?? null;
  const errorMessage =
    connectError?.message ??
    verifyError?.message ??
    logoutError?.message ??
    null;
  const prompt = statusCopy({
    isConnecting,
    isVerifying,
  });

  const resetFlow = () => {
    resetConnect();
    resetVerify();
    resetLogout();
  };

  const signIn = (walletAccount: WalletAccount) => {
    resetFlow();
    verifyWalletAccount({ walletAccount });
  };

  const connectProvider = (provider: WalletProviderData) => {
    resetFlow();
    void connectThenVerifyWallet({
      walletProviderKey: provider.key,
      isDeeplinkProvider: isDeeplinkWalletProvider({
        walletProvider: provider,
      }),
      connect,
      verify,
      isVerified: (walletAccount) => isWalletAccountVerified({ walletAccount }),
    }).then(
      () => {
        setIsPickerOpen(false);
      },
      () => {
        // Connect/verify errors surface through the mutation error state.
      }
    );
  };

  switch (session.kind) {
    case "unset":
    case "hydrating":
      return (
        <p className="text-xs uppercase tracking-[0.2em] text-[var(--t-muted)]">
          Preparing wallet…
        </p>
      );
    case "failed":
      return (
        <p className="max-w-xs text-xs leading-5 text-[var(--t-muted)]">
          {session.message}
        </p>
      );
    case "connected": {
      const needsSignature =
        evmAccount != null &&
        !isWalletAccountVerified({ walletAccount: evmAccount });

      return (
        <div className="flex flex-col gap-3">
          <p className="font-mono text-sm text-[var(--t-text)]">
            {formatShortAddress(session.address)}
          </p>
          {needsSignature ? (
            <div className="flex flex-col gap-2">
              <p className="max-w-xs text-xs leading-5 text-[var(--t-muted)]">
                {prompt ?? "Sign in your wallet to finish connecting."}
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-fit"
                disabled={isVerifying || evmAccount == null}
                onClick={() => {
                  if (!evmAccount) return;
                  signIn(evmAccount);
                }}
              >
                {isVerifying ? "Waiting for signature…" : "Sign in"}
              </Button>
            </div>
          ) : prompt ? (
            <p className="max-w-xs text-xs leading-5 text-[var(--t-muted)]">
              {prompt}
            </p>
          ) : null}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-fit"
            disabled={isLoggingOut}
            onClick={() => {
              resetFlow();
              logout();
            }}
          >
            Disconnect
          </Button>
          {errorMessage ? (
            <p className="text-xs text-[var(--t-muted)]">{errorMessage}</p>
          ) : null}
        </div>
      );
    }
    case "disconnected": {
      const view = deriveDisconnectedView({ isPickerOpen, evmProviders });
      switch (view.kind) {
        case "idle":
          return (
            <div className="flex flex-col gap-3">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-fit"
                onClick={() => {
                  resetFlow();
                  setIsPickerOpen(true);
                }}
              >
                Connect
              </Button>
              {errorMessage ? (
                <p className="text-xs text-[var(--t-muted)]">{errorMessage}</p>
              ) : null}
            </div>
          );
        case "no-providers":
          return (
            <div className="flex flex-col gap-3">
              <p className="max-w-xs text-xs leading-5 text-[var(--t-muted)]">
                Install an EVM wallet extension to connect.
              </p>
              {errorMessage ? (
                <p className="text-xs text-[var(--t-muted)]">{errorMessage}</p>
              ) : null}
            </div>
          );
        case "picking":
          return (
            <div className="flex flex-col gap-3">
              <ul className="flex w-full max-w-xs flex-col gap-2">
                {view.providers.map((provider) => (
                  <li key={provider.key}>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="w-full"
                      disabled={isConnecting || isVerifying}
                      onClick={() => connectProvider(provider)}
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
              {errorMessage ? (
                <p className="text-xs text-[var(--t-muted)]">{errorMessage}</p>
              ) : null}
            </div>
          );
        default: {
          const _exhaustive: never = view;
          return _exhaustive;
        }
      }
    }
    default: {
      const _exhaustive: never = session;
      return _exhaustive;
    }
  }
}
