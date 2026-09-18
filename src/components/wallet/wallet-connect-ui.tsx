"use client";

import type { WalletProviderData } from "@dynamic-labs-sdk/client";
import {
  useConnectAndVerifyWithWalletProvider,
  useGetAvailableWalletProvidersData,
  useLogout,
} from "@dynamic-labs-sdk/react-hooks";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useWalletSession } from "@/components/wallet/wallet-providers";
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

/** Wallet UI that assumes Dynamic hooks are available in the tree. */
export function WalletConnectUi() {
  const session = useWalletSession();
  const { data: providers = [] } = useGetAvailableWalletProvidersData();
  const {
    mutate: connectAndVerify,
    isPending: isConnecting,
    error: connectError,
    reset: resetConnect,
  } = useConnectAndVerifyWithWalletProvider();
  const {
    mutate: logout,
    isPending: isLoggingOut,
    error: logoutError,
    reset: resetLogout,
  } = useLogout();
  const [isPickerOpen, setIsPickerOpen] = useState(false);

  const evmProviders = providers.filter((provider) => provider.chain === "EVM");
  const errorMessage = connectError?.message ?? logoutError?.message ?? null;

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
    case "connected":
      return (
        <div className="flex flex-col gap-3">
          <p className="font-mono text-sm text-[var(--t-text)]">
            {formatShortAddress(session.address)}
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-fit"
            disabled={isLoggingOut}
            onClick={() => {
              resetConnect();
              resetLogout();
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
                  resetConnect();
                  resetLogout();
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
                      disabled={isConnecting}
                      onClick={() => {
                        resetConnect();
                        resetLogout();
                        connectAndVerify(
                          { walletProviderKey: provider.key },
                          {
                            onSuccess: () => setIsPickerOpen(false),
                          }
                        );
                      }}
                    >
                      {provider.metadata.displayName}
                    </Button>
                  </li>
                ))}
              </ul>
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
