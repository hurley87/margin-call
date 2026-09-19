"use client";

import { isEvmWalletAccount } from "@dynamic-labs-sdk/evm";
import { useGetWalletAccounts } from "@dynamic-labs-sdk/react-hooks";
import {
  useDynamicReady,
  useWalletSession,
} from "@/components/wallet/wallet-providers";
import { WalletConnectUi } from "@/components/wallet/wallet-connect-ui";
import { WalletNetworkControls } from "@/components/wallet/wallet-network-controls";

/**
 * Header wallet control.
 * Reads WalletSession for unset; waits for DynamicProvider before hooks.
 */
export function WalletConnectControl() {
  const session = useWalletSession();

  if (session.kind === "unset") {
    return (
      <div className="flex max-w-xs flex-col gap-2 text-xs leading-5 text-[var(--t-muted)]">
        <p className="font-bold uppercase tracking-[0.16em] text-[var(--t-muted)]">
          Wallet
        </p>
        <p>
          Set{" "}
          <code className="text-[var(--t-text)]">
            NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID
          </code>{" "}
          to enable Connect.
        </p>
      </div>
    );
  }

  return <WalletConnectGate />;
}

function WalletConnectGate() {
  const ready = useDynamicReady();
  if (!ready) {
    return (
      <p className="text-xs uppercase tracking-[0.2em] text-[var(--t-muted)]">
        Preparing wallet…
      </p>
    );
  }
  return <WalletConnectLive />;
}

function WalletConnectLive() {
  const { data: accounts = [] } = useGetWalletAccounts();
  const evmAccount = accounts.find(isEvmWalletAccount) ?? null;

  return (
    <div className="flex flex-col gap-2">
      <WalletConnectUi evmAccount={evmAccount} compact>
        {evmAccount ? <WalletNetworkControls evmAccount={evmAccount} /> : null}
      </WalletConnectUi>
    </div>
  );
}
