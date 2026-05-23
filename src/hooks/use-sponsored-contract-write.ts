"use client";

import { useCallback } from "react";
import { useSendTransaction } from "@privy-io/react-auth";
import { encodeFunctionData, type Abi } from "viem";

export type SponsoredContractWriteInput = {
  address: `0x${string}`;
  abi: Abi;
  functionName: string;
  args?: readonly unknown[];
  chainId: number;
  value?: bigint;
};

export function useSponsoredContractWrite() {
  const { sendTransaction } = useSendTransaction();

  return useCallback(
    async ({
      address,
      abi,
      functionName,
      args = [],
      chainId,
      value,
    }: SponsoredContractWriteInput) => {
      const data = encodeFunctionData({
        abi,
        functionName,
        args,
      } as Parameters<typeof encodeFunctionData>[0]);

      const { hash } = await sendTransaction(
        { to: address, data, chainId, value },
        { sponsor: true }
      );

      return hash;
    },
    [sendTransaction]
  );
}
