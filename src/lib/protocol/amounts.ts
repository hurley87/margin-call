import { formatUnits, parseUnits } from "viem";
import { STOCK_DECIMALS, USDC_DECIMALS } from "@/lib/protocol/constants";

/** Parse a human stock amount string into 8-decimal raw units. */
export function parseStockAmount(value: string): bigint | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    return parseUnits(trimmed, STOCK_DECIMALS);
  } catch {
    return null;
  }
}

export function formatStockAmount(raw: bigint): string {
  return formatUnits(raw, STOCK_DECIMALS);
}

export function formatUsdcRaw(raw: bigint): string {
  return formatUnits(raw, USDC_DECIMALS);
}
