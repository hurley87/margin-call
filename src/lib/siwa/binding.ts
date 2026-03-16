import { getAddress } from "viem";

/**
 * Ensure the verified SIWA identity is bound to the intended trader.
 */
export function siwaAuthMatchesTrader(
  siwa: { agentId?: number; address?: string },
  trader: { token_id: number; cdp_wallet_address: string | null }
): boolean {
  if (siwa.agentId === undefined || Number(siwa.agentId) !== trader.token_id) {
    return false;
  }
  if (!siwa.address || !trader.cdp_wallet_address) {
    return false;
  }
  return getAddress(siwa.address) === getAddress(trader.cdp_wallet_address);
}
