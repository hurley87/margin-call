"use client";

import type { WalletAccount } from "@dynamic-labs-sdk/client";
import { isProgrammaticNetworkSwitchAvailable } from "@dynamic-labs-sdk/client";
import { useGetActiveNetworkId } from "@dynamic-labs-sdk/react-hooks";
import { useMutation } from "@tanstack/react-query";
import { DrawablyButton } from "drawably/react";
import { SKETCH } from "@/components/ui/sketch";
import {
  parseNetworkIdToChainId,
  switchWalletToBase,
} from "@/lib/dynamic/resolve-wallet-client";
import { BASE_CHAIN_ID } from "@/lib/protocol/constants";
import { assertBaseChain } from "@/lib/protocol/readiness";

/** Chain label + Switch to Base for a connected EVM account. */
export function WalletNetworkControls(props: { evmAccount: WalletAccount }) {
  const { evmAccount } = props;

  const networkQuery = useGetActiveNetworkId({
    walletAccount: evmAccount,
    queryParams: {
      refetchInterval: 4_000,
    },
  });

  const chainId = parseNetworkIdToChainId(networkQuery.data?.networkId);
  const chainGate = assertBaseChain(chainId);
  const canSwitch = isProgrammaticNetworkSwitchAvailable({
    walletAccount: evmAccount,
  });

  const switchMutation = useMutation({
    mutationFn: () => switchWalletToBase(evmAccount),
  });

  return (
    <div className="flex flex-col gap-2 text-xs text-[var(--t-muted)]">
      <p>
        Chain:{" "}
        {chainId === BASE_CHAIN_ID ? (
          <span className="text-[var(--t-green)]">Base (8453)</span>
        ) : (
          <span className="text-[var(--t-amber)]">
            {chainId == null ? "unknown" : `chain ${chainId}`}
          </span>
        )}
      </p>
      {!chainGate.ok ? (
        <div className="flex flex-col gap-2">
          <p>{chainGate.reason}</p>
          {canSwitch ? (
            <>
              <DrawablyButton
                {...SKETCH}
                type="button"
                variant="outline"
                disabled={switchMutation.isPending}
                onClick={() => {
                  switchMutation.reset();
                  switchMutation.mutate();
                }}
              >
                Switch to Base
              </DrawablyButton>
              {switchMutation.error ? (
                <p className="text-[var(--t-red)]">
                  {switchMutation.error instanceof Error
                    ? switchMutation.error.message
                    : "Failed to switch to Base."}
                </p>
              ) : null}
            </>
          ) : (
            <p>Switch the wallet to Base mainnet (8453) to continue.</p>
          )}
        </div>
      ) : null}
    </div>
  );
}
