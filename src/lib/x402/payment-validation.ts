import {
  DEAL_CREATION_FEE_PERCENTAGE,
  MIN_POT_AMOUNT,
  PLATFORM_WALLET_ADDRESS,
} from "@/lib/constants";

/**
 * Formats a dollar amount as an x402 price string (e.g. "$50.00").
 */
export function formatPaymentPrice(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

/**
 * Calculates the platform fee for a deal creation.
 */
export function calculateCreationFee(potAmount: number): number {
  return potAmount * (DEAL_CREATION_FEE_PERCENTAGE / 100);
}

/**
 * Calculates the net pot after deducting the creation fee.
 */
export function calculateNetPot(potAmount: number): number {
  return potAmount - calculateCreationFee(potAmount);
}

/**
 * Validates a pot amount for deal creation and returns the x402 price string.
 * Returns null if the amount is invalid.
 */
export function resolveDealPaymentPrice(
  body: Record<string, unknown>
): string | null {
  const potAmount = Number(body.pot_amount);
  if (!potAmount || !Number.isFinite(potAmount) || potAmount < MIN_POT_AMOUNT) {
    return null;
  }
  return formatPaymentPrice(potAmount);
}

/**
 * Returns the wallet address that should receive the platform fee.
 */
export function getFeeRecipient(): string {
  return PLATFORM_WALLET_ADDRESS;
}
