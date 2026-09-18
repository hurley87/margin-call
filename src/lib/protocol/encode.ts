import { encodeFunctionData } from "viem";
import { erc20Abi, marginCallAbi } from "@/lib/protocol/abi";

/**
 * Encode `openPosition(assetId, stockAmount, targetLeverage, 0)`.
 * For this minimal UI, `minStockOut = 0` is intentional — the execution adapter
 * still enforces its oracle-relative floor.
 */
export function encodeOpenPosition(args: {
  assetId: bigint;
  stockAmount: bigint;
  targetLeverage: bigint;
}): `0x${string}` {
  return encodeFunctionData({
    abi: marginCallAbi,
    functionName: "openPosition",
    args: [args.assetId, args.stockAmount, args.targetLeverage, 0n],
  });
}

export function encodeRepay(args: {
  tokenId: bigint;
  amount: bigint;
}): `0x${string}` {
  return encodeFunctionData({
    abi: marginCallAbi,
    functionName: "repay",
    args: [args.tokenId, args.amount],
  });
}

export function encodeClosePosition(tokenId: bigint): `0x${string}` {
  return encodeFunctionData({
    abi: marginCallAbi,
    functionName: "closePosition",
    args: [tokenId],
  });
}

export function encodeApprove(args: {
  spender: `0x${string}`;
  amount: bigint;
}): `0x${string}` {
  return encodeFunctionData({
    abi: erc20Abi,
    functionName: "approve",
    args: [args.spender, args.amount],
  });
}
