"use client";

import { useCallback, useMemo } from "react";
import { useWallets } from "@privy-io/react-auth";
import { PAYMENT_CHAIN } from "@margin-call/shared";
import {
  createWalletClient,
  custom,
  type Address,
  type Hash,
  type PublicClient,
} from "viem";

/**
 * One Privy-to-viem boundary for every user-signed Maker lifecycle write.
 * Transaction sequencing and durability stay in the shared operation journal;
 * this hook only resolves the scoped signer and exact-hash receipt client.
 */
export function useMakerTransactionClient(
  walletAddress: Address,
  publicClient: PublicClient
) {
  const { wallets } = useWallets();
  const wallet = useMemo(
    () =>
      wallets.find(
        (candidate) =>
          candidate.address.toLowerCase() === walletAddress.toLowerCase()
      ),
    [walletAddress, wallets]
  );

  const getWalletClient = useCallback(async () => {
    if (!wallet) throw new Error("Connected Privy EVM wallet is unavailable");
    const provider = await wallet.getEthereumProvider();
    return createWalletClient({
      account: walletAddress,
      chain: PAYMENT_CHAIN,
      transport: custom(provider),
    });
  }, [wallet, walletAddress]);

  const waitForReceipt = useCallback(
    (hash: Hash) => publicClient.waitForTransactionReceipt({ hash }),
    [publicClient]
  );

  return {
    walletReady: Boolean(wallet),
    getWalletClient,
    waitForReceipt,
  };
}
