import { readBase, type AgentResult } from "@/lib/agent/result";
import { formatUsdcRaw } from "@/lib/protocol/amounts";
import { USDC_DECIMALS } from "@/lib/protocol/constants";
import { baseDeployment } from "@/lib/protocol/deployment";
import type { BasePublicClient } from "@/lib/protocol/public-client";
import { loadAvailableCredit } from "@/lib/protocol/reads";

export type CreditPoolPayload = {
  /** USDC base units, as a decimal string. */
  availableCredit: string;
  /** The same figure in whole USDC, for prompts and logs. */
  availableCreditUsdc: string;
  creditPool: `0x${string}`;
  token: `0x${string}`;
  decimals: number;
  chainId: number;
};

/**
 * Credit the pool can still lend. An open needs the whole principal available
 * at once, so this is the ceiling on any single financed position.
 */
export async function getCreditPool(
  client: BasePublicClient
): Promise<AgentResult<CreditPoolPayload>> {
  const available = await readBase(() => loadAvailableCredit(client));
  if (!available.ok) return available;

  return {
    ok: true,
    availableCredit: available.value.toString(),
    availableCreditUsdc: formatUsdcRaw(available.value),
    creditPool: baseDeployment.creditPool,
    token: baseDeployment.usdc,
    decimals: USDC_DECIMALS,
    chainId: baseDeployment.chainId,
  };
}
