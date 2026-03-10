import { NextRequest, NextResponse } from "next/server";
import { parseUnits } from "viem";
import { createServerClient } from "@/lib/supabase/client";
import { makeOperatorWalletClient } from "@/lib/contracts/operator";
import { makePublicClient } from "@/lib/contracts/client";
import { ESCROW_ADDRESS, escrowAbi } from "@/lib/contracts/escrow";
import { getOnChainDeal } from "@/lib/contracts/on-chain";

function usdcToUnits(amount: number): bigint {
  const abs = Math.abs(amount);
  const units = parseUnits(abs.toFixed(6), 6);
  return amount < 0 ? -units : units;
}

/**
 * POST /api/deal/resolve-pending
 *
 * Resolves stuck on-chain pending entries by calling resolveEntry
 * from the operator wallet. Looks up unresolved outcomes in Supabase
 * (on_chain_tx_hash IS NULL) for deals that have on-chain pending entries.
 *
 * Body (optional):
 *   { deal_id?: string }  — resolve pending entries for a specific deal
 *                            If omitted, resolves all stuck entries.
 *
 * Protected by OPERATOR_SECRET header (server-side admin only).
 */
export async function POST(request: NextRequest) {
  // Simple admin auth via shared secret
  const secret = request.headers.get("x-operator-secret");
  if (secret !== process.env.OPERATOR_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const { deal_id } = body as { deal_id?: string };

    const supabase = createServerClient();

    // Find unresolved outcomes: entered on-chain but resolveEntry not called
    let query = supabase
      .from("deal_outcomes")
      .select(
        "id, deal_id, trader_id, trader_pnl_usdc, rake_usdc, deals!inner(on_chain_deal_id), traders!inner(token_id)"
      )
      .is("on_chain_tx_hash", null);

    if (deal_id) {
      query = query.eq("deal_id", deal_id);
    }

    const { data: unresolvedOutcomes, error } = await query;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!unresolvedOutcomes || unresolvedOutcomes.length === 0) {
      return NextResponse.json({ resolved: 0, message: "No pending entries" });
    }

    const walletClient = makeOperatorWalletClient();
    const publicClient = makePublicClient();
    const results: Array<{
      outcome_id: string;
      status: string;
      tx_hash?: string;
      error?: string;
    }> = [];

    for (const outcome of unresolvedOutcomes) {
      const deal = outcome.deals as unknown as { on_chain_deal_id: number };
      const trader = outcome.traders as unknown as { token_id: number };

      if (
        deal.on_chain_deal_id === null ||
        deal.on_chain_deal_id === undefined
      ) {
        results.push({
          outcome_id: outcome.id,
          status: "skipped",
          error: "No on-chain deal ID",
        });
        continue;
      }

      const onChainDealId = BigInt(deal.on_chain_deal_id);
      const tokenId = BigInt(trader.token_id);

      // Read on-chain deal to verify pending entries and queue head
      const onChainDeal = await getOnChainDeal(onChainDealId);
      if (!onChainDeal || Number(onChainDeal.pendingEntries) === 0) {
        // Already resolved on-chain — just update the DB
        results.push({
          outcome_id: outcome.id,
          status: "skipped",
          error: "No pending entries on-chain (already resolved?)",
        });
        continue;
      }

      const pnlUnits = usdcToUnits(Number(outcome.trader_pnl_usdc));
      const rakeUnits = usdcToUnits(Number(outcome.rake_usdc));

      try {
        const hash = await walletClient.writeContract({
          address: ESCROW_ADDRESS,
          abi: escrowAbi,
          functionName: "resolveEntry",
          args: [onChainDealId, tokenId, pnlUnits, rakeUnits],
        });

        await publicClient.waitForTransactionReceipt({ hash });

        // Update the outcome with the tx hash
        await supabase
          .from("deal_outcomes")
          .update({ on_chain_tx_hash: hash })
          .eq("id", outcome.id);

        results.push({
          outcome_id: outcome.id,
          status: "resolved",
          tx_hash: hash,
        });
      } catch (err) {
        results.push({
          outcome_id: outcome.id,
          status: "error",
          error: err instanceof Error ? err.message : "Unknown error",
        });
      }
    }

    const resolvedCount = results.filter((r) => r.status === "resolved").length;
    return NextResponse.json({ resolved: resolvedCount, results });
  } catch (e) {
    console.error("Resolve pending error:", e);
    const message = e instanceof Error ? e.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
