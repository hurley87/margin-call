"use client";

import { useWriteContract } from "wagmi";
import { erc20Abi, parseUnits } from "viem";
import { USDC_ADDRESS } from "@/lib/constants";
import { base } from "viem/chains";

export function useSendUsdc() {
  const { writeContract, isPending, isSuccess, error, data } =
    useWriteContract();

  function send({ to, amount }: { to: string; amount: number }) {
    writeContract({
      address: USDC_ADDRESS as `0x${string}`,
      abi: erc20Abi,
      functionName: "transfer",
      args: [to as `0x${string}`, parseUnits(amount.toString(), 6)],
      chainId: base.id,
    });
  }

  return { send, isPending, isSuccess, error, txHash: data };
}
