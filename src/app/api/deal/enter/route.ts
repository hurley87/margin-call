import { NextRequest, NextResponse } from "next/server";
import { verifyPrivyToken } from "@/lib/privy/server";
import { createServerClient } from "@/lib/supabase/client";
import {
  createDealOutcome,
  getDeal,
  updateDealAfterEntry,
} from "@/lib/supabase/queries";
import { callModel } from "@/lib/llm/call-model";
import {
  buildDealResolutionMessages,
  buildCorrectionMessages,
} from "@/lib/llm/messages";
import {
  DealOutcomeSchema,
  CorrectionNarrativeSchema,
  type DealOutcome,
} from "@/lib/llm/schemas";
import { RAKE_PERCENTAGE, MAX_EXTRACTION_PERCENTAGE } from "@/lib/constants";
import { randomBytes } from "crypto";

function generateRandomSeed(): number {
  const bytes = randomBytes(4);
  return bytes.readUInt32BE() / 0xffffffff;
}

export async function POST(request: NextRequest) {
  try {
    const { user } = await verifyPrivyToken(request);

    const walletAddress = user.wallet?.address;
    if (!walletAddress) {
      return NextResponse.json(
        { error: "No wallet linked to this account" },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { deal_id } = body as { deal_id?: string };

    if (!deal_id) {
      return NextResponse.json(
        { error: "deal_id is required" },
        { status: 400 }
      );
    }

    // Look up desk manager (acting as trader for now)
    const supabase = createServerClient();
    const { data: trader, error: traderError } = await supabase
      .from("desk_managers")
      .select("id, display_name, wallet_address")
      .eq("wallet_address", walletAddress)
      .single();

    if (traderError || !trader) {
      return NextResponse.json(
        { error: "Desk manager not found. Register first." },
        { status: 404 }
      );
    }

    // Fetch the deal
    const deal = await getDeal(deal_id);

    if (deal.status !== "open") {
      return NextResponse.json({ error: "Deal is not open" }, { status: 400 });
    }

    // Generate random seed
    const randomSeed = generateRandomSeed();

    // Calculate max win value (25% of pot)
    const maxValuePerWin = deal.pot_usdc * (MAX_EXTRACTION_PERCENTAGE / 100);

    // Call GPT-5 mini for deal resolution
    const messages = await buildDealResolutionMessages({
      dealPrompt: deal.prompt,
      traderName: trader.display_name || "Anonymous Trader",
      traderInventory: [], // TODO: load from assets table when built
      portfolioBalance: deal.entry_cost_usdc, // use entry cost as proxy for now
      maxValuePerWin,
      randomSeed,
    });

    const outcome = await callModel<DealOutcome>(
      messages,
      DealOutcomeSchema,
      "deal_outcome"
    );

    // Validate and cap the outcome
    let corrected = false;
    const originalBalanceChange = outcome.balance_change_usdc;

    // Cap winnings at max extraction percentage of pot
    if (outcome.balance_change_usdc > maxValuePerWin) {
      outcome.balance_change_usdc = maxValuePerWin;
      corrected = true;
    }

    // Cap losses at entry cost (trader can't lose more than they paid)
    if (outcome.balance_change_usdc < -deal.entry_cost_usdc) {
      outcome.balance_change_usdc = -deal.entry_cost_usdc;
      corrected = true;
    }

    // Correction flow: rewrite narrative if we modified the outcome
    if (corrected) {
      const correctionMessages = await buildCorrectionMessages({
        originalNarrative: outcome.narrative,
        originalBalanceChange,
        correctedBalanceChange: outcome.balance_change_usdc,
        traderName: trader.display_name || "Anonymous Trader",
      });

      const correction = await callModel<{
        corrected_narrative: typeof outcome.narrative;
      }>(correctionMessages, CorrectionNarrativeSchema, "correction_narrative");

      outcome.narrative = correction.corrected_narrative;
    }

    // Calculate rake on winnings (only if trader won)
    let rakeAmount = 0;
    if (outcome.balance_change_usdc > 0) {
      rakeAmount = outcome.balance_change_usdc * (RAKE_PERCENTAGE / 100);
    }

    // Net P&L for the trader (winnings minus rake, or full loss)
    const traderPnl =
      outcome.balance_change_usdc > 0
        ? outcome.balance_change_usdc - rakeAmount
        : outcome.balance_change_usdc;

    // Pot change: entry cost goes in, winnings come out
    const potChange =
      deal.entry_cost_usdc -
      (outcome.balance_change_usdc > 0 ? outcome.balance_change_usdc : 0);

    // Save outcome
    const dealOutcome = await createDealOutcome({
      deal_id,
      trader_id: trader.id,
      narrative: outcome.narrative,
      trader_pnl_usdc: traderPnl,
      pot_change_usdc: potChange,
      rake_usdc: rakeAmount,
      assets_gained: outcome.assets_gained,
      assets_lost: outcome.assets_lost,
      trader_wiped_out: outcome.trader_wiped_out,
      wipeout_reason: outcome.wipeout_reason,
    });

    // Update deal stats
    await updateDealAfterEntry(deal_id, potChange, outcome.trader_wiped_out);

    return NextResponse.json({
      outcome: dealOutcome,
      summary: {
        balance_change: outcome.balance_change_usdc,
        rake: rakeAmount,
        net_pnl: traderPnl,
        wiped_out: outcome.trader_wiped_out,
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Internal server error";
    const status = message.includes("not found") ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
