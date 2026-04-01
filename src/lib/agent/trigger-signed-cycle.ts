import { getOrCreateTraderSmartAccount } from "@/lib/cdp/trader-wallet";
import { signAgentRequest } from "@/lib/siwa/sign";
import { getTrader } from "@/lib/supabase/traders";

/**
 * Fire POST /api/agent/cycle with SIWA headers for the given trader.
 * Used by resume and the cron scheduler.
 */
export async function postSignedAgentCycle(
  traderId: string,
  baseUrl: string
): Promise<Response> {
  const traderData = await getTrader(traderId);
  const { owner, smartAccount } = await getOrCreateTraderSmartAccount(
    traderData.token_id
  );

  const nonceRes = await fetch(`${baseUrl}/api/siwa/nonce`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      agent_id: traderData.token_id,
      address: smartAccount.address,
    }),
  });

  if (!nonceRes.ok) {
    throw new Error(
      `SIWA nonce request failed (${nonceRes.status}) for trader ${traderId}`
    );
  }

  const { nonce } = await nonceRes.json();
  const { message, signature } = await signAgentRequest(
    owner,
    traderData.token_id,
    nonce,
    smartAccount
  );
  const siwaHeaders = {
    "x-siwa-message": Buffer.from(message).toString("base64"),
    "x-siwa-signature": signature,
  };

  return fetch(`${baseUrl}/api/agent/cycle`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...siwaHeaders,
    },
    body: JSON.stringify({ trader_id: traderId }),
  });
}
