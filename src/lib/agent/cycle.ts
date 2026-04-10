import { createServerClient } from "@/lib/supabase/client";
import {
  listOpenDeals,
  clearTraderAssets,
  getResolvedDealIdsForTrader,
} from "@/lib/supabase/queries";
import { getTrader } from "@/lib/supabase/traders";
import { evaluateDeals, type Mandate } from "./evaluator";
import {
  excludeDealsForDeskDedup,
  selectDealForTrader,
} from "./deal-selection";
import { logActivity, logActivities } from "./activity";
import {
  createApproval,
  hasPendingApproval,
  consumeApprovedEntry,
} from "@/lib/supabase/approvals";
import { getOrCreateTraderSmartAccount } from "@/lib/cdp/trader-wallet";
import { signAgentRequest } from "@/lib/siwa/sign";

export type CycleStatus =
  | "entered"
  | "no_deals"
  | "skipped_all"
  | "wiped_out"
  | "paused"
  | "awaiting_approval"
  | "not_found"
  | "error";

export interface CycleResult {
  traderId: string;
  status: CycleStatus;
  dealId?: string;
  pnl?: number;
  wipedOut?: boolean;
  message: string;
}

/**
 * Run one cycle of the agent trade loop for a given trader.
 *
 * Steps:
 * 1. Verify trader is active
 * 2. Scan open deals
 * 3. Evaluate against mandate + balance
 * 4. Pick best deal and enter it via internal API call
 * 5. Log activity
 */
export async function runCycle(
  traderId: string,
  baseUrl: string
): Promise<CycleResult> {
  let trader;
  try {
    trader = await getTrader(traderId);
  } catch {
    return { traderId, status: "not_found", message: "Trader not found" };
  }

  if (trader.status === "paused") {
    await logActivity(
      traderId,
      "cycle_start",
      "Cycle skipped — trader is paused"
    );
    return { traderId, status: "paused", message: "Trader is paused" };
  }

  if (trader.status === "wiped_out") {
    return { traderId, status: "wiped_out", message: "Trader is wiped out" };
  }

  await logActivity(traderId, "cycle_start", "Starting trade cycle");

  // Scan open deals + use cached balance
  const deals = await listOpenDeals();
  const balance = trader.escrow_balance_usdc;
  await logActivity(traderId, "scan", `Found ${deals.length} open deal(s)`);

  if (deals.length === 0) {
    await logActivity(traderId, "cycle_end", "No open deals available");
    return { traderId, status: "no_deals", message: "No open deals" };
  }

  // Evaluate deals against mandate
  const mandate = (trader.mandate ?? {}) as Mandate;
  const resolvedDealIds = await getResolvedDealIdsForTrader(
    traderId,
    deals.map((deal) => deal.id)
  );
  const freshDeals = deals.filter((deal) => !resolvedDealIds.has(deal.id));
  const alreadyResolved = deals
    .filter((deal) => resolvedDealIds.has(deal.id))
    .map((deal) => ({
      deal,
      reason: "deal already resolved by this trader",
    }));
  const { eligible, skipped: mandateSkipped } = evaluateDeals(
    freshDeals,
    mandate,
    balance
  );
  const skipped = [...alreadyResolved, ...mandateSkipped];

  // Batch-log all skipped deals in one query
  if (skipped.length > 0) {
    await logActivities(
      skipped.map(({ deal, reason }) => ({
        trader_id: traderId,
        activity_type: "skip" as const,
        message: reason,
        deal_id: deal.id,
      }))
    );
  }

  await logActivity(
    traderId,
    "evaluate",
    `${eligible.length} eligible, ${skipped.length} skipped (balance: $${balance.toFixed(2)})`,
    undefined,
    { eligible_count: eligible.length, skipped_count: skipped.length, balance }
  );

  // Same-desk dedup — avoid piling into deals siblings entered recently
  const { filtered: dedupedEligible, excludedIds: deskDedupExcluded } =
    await excludeDealsForDeskDedup(eligible, traderId, trader.owner_address);

  if (deskDedupExcluded.length > 0) {
    await logActivity(
      traderId,
      "skip",
      `Desk dedup: skipped ${deskDedupExcluded.length} deal(s) entered by another trader on this desk in the last window`,
      undefined,
      { desk_dedup_excluded_deal_ids: deskDedupExcluded }
    );
  }

  if (dedupedEligible.length === 0) {
    await logActivity(
      traderId,
      "cycle_end",
      "No eligible deals after desk deduplication"
    );
    return {
      traderId,
      status: "skipped_all",
      message: "No eligible deals after desk deduplication",
    };
  }

  const useLlm =
    mandate.llm_deal_selection !== false && Boolean(process.env.OPENAI_API_KEY);

  const selection = await selectDealForTrader(dedupedEligible, {
    traderId,
    traderName: trader.name,
    escrowBalanceUsdc: balance,
    personality: trader.personality,
    useLlm,
  });

  await logActivity(
    traderId,
    "evaluate",
    `Deal selection (${selection.method}): ${selection.reasoning.slice(0, 500)}`,
    selection.deal?.id,
    { selection_method: selection.method }
  );

  const bestDeal = selection.deal;
  if (!bestDeal) {
    await logActivity(
      traderId,
      "cycle_end",
      "No deal chosen after ranking (skip all or LLM skip)"
    );
    return {
      traderId,
      status: "skipped_all",
      message: "No deal selected after evaluation",
    };
  }

  // Check approval threshold
  const threshold = mandate.approval_threshold_usdc;
  if (threshold !== undefined && bestDeal.entry_cost_usdc >= threshold) {
    const consumedApprovalId = await consumeApprovedEntry(
      traderId,
      bestDeal.id
    );
    if (!consumedApprovalId) {
      // Check if there's already a pending approval for this deal
      const alreadyPending = await hasPendingApproval(traderId, bestDeal.id);
      if (!alreadyPending) {
        // Look up the desk manager for this trader (wallet casing may differ from DB)
        const supabase = createServerClient();
        const { data: deskMgr } = await supabase
          .from("desk_managers")
          .select("id")
          .ilike("wallet_address", trader.owner_address)
          .maybeSingle();

        if (!deskMgr?.id) {
          await logActivity(
            traderId,
            "error",
            "Deal needs approval but no desk_managers row matches this trader's owner_address — complete desk registration first",
            bestDeal.id
          );
          await logActivity(
            traderId,
            "cycle_end",
            "Cycle ended — cannot create approval without a registered desk manager"
          );
          return {
            traderId,
            status: "error",
            dealId: bestDeal.id,
            message:
              "Approval required but your wallet is not registered as a desk manager. Open the app and complete desk registration, then retry.",
          };
        }

        await createApproval({
          traderId,
          dealId: bestDeal.id,
          deskManagerId: deskMgr.id,
          entryCostUsdc: bestDeal.entry_cost_usdc,
          potUsdc: bestDeal.pot_usdc,
        });
      }
      await logActivity(
        traderId,
        "approval_required",
        `Deal requires approval: entry $${bestDeal.entry_cost_usdc} >= threshold $${threshold}`,
        bestDeal.id
      );
      await logActivity(
        traderId,
        "cycle_end",
        "Cycle paused — awaiting desk manager approval"
      );
      return {
        traderId,
        status: "awaiting_approval",
        dealId: bestDeal.id,
        message: `Deal requires approval (entry $${bestDeal.entry_cost_usdc} >= threshold $${threshold})`,
      };
    }

    await logActivity(
      traderId,
      "approved",
      "Consumed desk manager approval and entering deal",
      bestDeal.id,
      { approval_id: consumedApprovalId }
    );
  }

  // Enter the deal via the existing /api/deal/enter route
  await logActivity(
    traderId,
    "enter",
    `Entering deal: "${bestDeal.prompt.slice(0, 80)}..." (entry: $${bestDeal.entry_cost_usdc}, pot: $${bestDeal.pot_usdc})`,
    bestDeal.id
  );

  try {
    // Sign request with SIWA (Sign In With Agent) for per-agent identity
    const { owner, smartAccount } = await getOrCreateTraderSmartAccount(
      trader.token_id
    );
    const nonceRes = await fetch(`${baseUrl}/api/siwa/nonce`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        agent_id: trader.token_id,
        address: smartAccount.address,
      }),
    });
    let siwaHeaders: Record<string, string> = {};
    if (nonceRes.ok) {
      const { nonce } = await nonceRes.json();
      const { message, signature } = await signAgentRequest(
        owner,
        trader.token_id,
        nonce,
        smartAccount
      );
      siwaHeaders = {
        "x-siwa-message": Buffer.from(message).toString("base64"),
        "x-siwa-signature": signature,
      };
    }

    const enterRes = await fetch(`${baseUrl}/api/deal/enter`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...siwaHeaders,
      },
      body: JSON.stringify({
        deal_id: bestDeal.id,
        trader_id: traderId,
        _agent_cycle: true,
      }),
    });

    if (!enterRes.ok) {
      const err = await enterRes
        .json()
        .catch(() => ({ error: "Unknown error" }));
      if (enterRes.status === 409) {
        await logActivity(
          traderId,
          "skip",
          err.error ?? "Deal already entered by this trader",
          bestDeal.id,
          { status: enterRes.status }
        );
        await logActivity(
          traderId,
          "cycle_end",
          "Cycle ended — duplicate deal prevented"
        );
        return {
          traderId,
          status: "skipped_all",
          dealId: bestDeal.id,
          message: err.error ?? "Deal already entered by this trader",
        };
      }
      await logActivity(
        traderId,
        "error",
        `Deal entry failed: ${err.error}`,
        bestDeal.id,
        { status: enterRes.status }
      );
      await logActivity(traderId, "cycle_end", "Cycle ended with error");
      return {
        traderId,
        status: "error",
        dealId: bestDeal.id,
        message: `Deal entry failed: ${err.error}`,
      };
    }

    const result = await enterRes.json();
    const pnl = result.summary?.net_pnl ?? 0;
    const wipedOut = result.summary?.wiped_out ?? false;

    const activityType = wipedOut ? "wipeout" : pnl >= 0 ? "win" : "loss";
    await logActivity(
      traderId,
      activityType,
      `Deal outcome: PnL $${pnl.toFixed(2)}${wipedOut ? " — WIPED OUT" : ""}`,
      bestDeal.id,
      { pnl, wiped_out: wipedOut, enter_tx: result.summary?.enter_tx_hash }
    );

    if (wipedOut) {
      const supabase = createServerClient();
      await supabase
        .from("traders")
        .update({ status: "wiped_out" })
        .eq("id", traderId);
      await clearTraderAssets(traderId);
      await logActivity(
        traderId,
        "cycle_end",
        "Trader wiped out — cycle ended permanently"
      );
    } else {
      await logActivity(traderId, "cycle_end", "Cycle complete");
    }

    return {
      traderId,
      status: wipedOut ? "wiped_out" : "entered",
      dealId: bestDeal.id,
      pnl,
      wipedOut,
      message: wipedOut
        ? "Trader wiped out"
        : `Entered deal, PnL: $${pnl.toFixed(2)}`,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    await logActivity(
      traderId,
      "error",
      `Cycle error: ${message}`,
      bestDeal.id
    );
    await logActivity(traderId, "cycle_end", "Cycle ended with error");
    return { traderId, status: "error", dealId: bestDeal.id, message };
  }
}
