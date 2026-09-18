"use client";

import {
  useConnectAndVerifyWithWalletProvider,
  useGetAvailableWalletProvidersData,
  useGetWalletAccounts,
  useInitStatus,
  useLogout,
} from "@dynamic-labs-sdk/react-hooks";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { getEvmWalletAddress, truncateAddress } from "@/lib/dynamic/wallet";

/** Wallet UI that assumes Dynamic hooks are available in the tree. */
export function WalletConnectUi() {
  const { data: initStatus, error: initError } = useInitStatus();
  const { data: accounts = [] } = useGetWalletAccounts();
  const { data: providers = [] } = useGetAvailableWalletProvidersData();
  const { mutate: connectAndVerify, isPending: isConnecting } =
    useConnectAndVerifyWithWalletProvider();
  const { mutate: logout, isPending: isLoggingOut } = useLogout();
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (initStatus === "failed") {
    return (
      <p className="mt-8 max-w-xs text-center text-xs leading-5 text-[var(--t-muted)]">
        {initError?.message ?? "Wallet failed to initialize."}
      </p>
    );
  }

  if (initStatus !== "finished") {
    return (
      <p className="mt-8 text-xs uppercase tracking-[0.2em] text-[var(--t-muted)]">
        Preparing wallet…
      </p>
    );
  }

  const address = getEvmWalletAddress(accounts);
  const evmProviders = providers.filter((provider) => provider.chain === "EVM");

  if (address) {
    return (
      <div className="mt-8 flex flex-col items-center gap-3">
        <p className="font-mono text-sm text-[var(--t-text)]">
          {truncateAddress(address)}
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={isLoggingOut}
          onClick={() => {
            setErrorMessage(null);
            logout(undefined, {
              onError: (error) => {
                setErrorMessage(
                  error instanceof Error ? error.message : "Disconnect failed"
                );
              },
            });
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

  return (
    <div className="mt-8 flex flex-col items-center gap-3">
      {!isPickerOpen ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            setErrorMessage(null);
            setIsPickerOpen(true);
          }}
        >
          Connect
        </Button>
      ) : evmProviders.length === 0 ? (
        <p className="max-w-xs text-center text-xs leading-5 text-[var(--t-muted)]">
          Install an EVM wallet extension to connect.
        </p>
      ) : (
        <ul className="flex w-full max-w-xs flex-col gap-2">
          {evmProviders.map((provider) => (
            <li key={provider.key}>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full"
                disabled={isConnecting}
                onClick={() => {
                  setErrorMessage(null);
                  connectAndVerify(
                    { walletProviderKey: provider.key },
                    {
                      onSuccess: () => setIsPickerOpen(false),
                      onError: (error) => {
                        setErrorMessage(
                          error instanceof Error
                            ? error.message
                            : "Connection failed"
                        );
                      },
                    }
                  );
                }}
              >
                {provider.metadata.displayName}
              </Button>
            </li>
          ))}
        </ul>
      )}
      {errorMessage ? (
        <p className="text-xs text-[var(--t-muted)]">{errorMessage}</p>
      ) : null}
    </div>
  );
}
