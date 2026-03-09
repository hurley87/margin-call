import { createServerClient } from "@/lib/supabase/client";
import { listOpenDeals, clearTraderAssets } from "@/lib/supabase/queries";
import { getTrader } from "@/lib/supabase/traders";
import { getEscrowBalance } from "@/lib/contracts/balance";
import { evaluateDeals, pickBestDeal, type Mandate } from "./evaluator";
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
  // Step 1: Get trader
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

  // Step 2: Scan open deals + check balance in parallel
  const [deals, balance] = await Promise.all([
    listOpenDeals(),
    getEscrowBalance(trader.token_id),
  ]);
  await logActivity(traderId, "scan", `Found ${deals.length} open deal(s)`);

  if (deals.length === 0) {
    await logActivity(traderId, "cycle_end", "No open deals available");
    return { traderId, status: "no_deals", message: "No open deals" };
  }

  // Step 4: Evaluate deals against mandate
  const mandate = (trader.mandate ?? {}) as Mandate;
  const { eligible, skipped } = evaluateDeals(deals, mandate, balance);

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

  // Step 5: Pick best deal
  const bestDeal = pickBestDeal(eligible);
  if (!bestDeal) {
    await logActivity(
      traderId,
      "cycle_end",
      "No eligible deals after filtering"
    );
    return { traderId, status: "skipped_all", message: "No eligible deals" };
  }

  // Step 5b: Check approval threshold
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
        await createApproval(traderId, bestDeal.id, bestDeal.entry_cost_usdc);
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

  // Step 6: Enter the deal via the existing /api/deal/enter route
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
