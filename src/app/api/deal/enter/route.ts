import { NextRequest, NextResponse } from "next/server";
import { keccak256, toBytes, parseUnits } from "viem";
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
import { makePublicClient } from "@/lib/contracts/client";
import { makeOperatorWalletClient } from "@/lib/contracts/operator";
import {
  ESCROW_ADDRESS,
  REPUTATION_REGISTRY_ADDRESS,
  escrowAbi,
  reputationRegistryAbi,
} from "@/lib/contracts/escrow";
import { randomBytes } from "crypto";

function generateRandomSeed(): number {
  const bytes = randomBytes(4);
  return bytes.readUInt32BE() / 0xffffffff;
}

/** Convert USDC amount (human-readable) to on-chain 6-decimal BigInt */
function usdcToUnits(amount: number): bigint {
  // Use parseUnits for precision, but handle negative values
  const abs = Math.abs(amount);
  const units = parseUnits(abs.toFixed(6), 6);
  return amount < 0 ? -units : units;
}

/**
 * Post deal outcome to the ERC-8004 Reputation Registry.
 * Best-effort: failures are logged but do not block the response.
 */
async function postReputation(
  tokenId: bigint,
  pnlUsdc: number,
  wipedOut: boolean,
  dealId: string,
  outcomeId: string
) {
  try {
    const walletClient = makeOperatorWalletClient();
    const publicClient = makePublicClient();

    // value = pnl in USDC scaled to 6 decimals (int128)
    const value = BigInt(Math.round(pnlUsdc * 1_000_000));
    const valueDecimals = 6;

    const tag1 = "deal_outcome";
    const tag2 = wipedOut ? "wipeout" : pnlUsdc >= 0 ? "win" : "loss";
    const endpoint = "margin-call";

    const feedbackURI = JSON.stringify({
      deal_id: dealId,
      outcome_id: outcomeId,
      pnl_usdc: pnlUsdc,
      wiped_out: wipedOut,
    });
    const feedbackHash = keccak256(toBytes(feedbackURI));

    const hash = await walletClient.writeContract({
      address: REPUTATION_REGISTRY_ADDRESS,
      abi: reputationRegistryAbi,
      functionName: "giveFeedback",
      args: [
        tokenId,
        value,
        valueDecimals,
        tag1,
        tag2,
        endpoint,
        feedbackURI,
        feedbackHash,
      ],
    });

    await publicClient.waitForTransactionReceipt({ hash });
    return hash;
  } catch (err) {
    console.error("Failed to post reputation:", err);
    return null;
  }
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
    const { deal_id, trader_id } = body as {
      deal_id?: string;
      trader_id?: string;
    };

    if (!deal_id) {
      return NextResponse.json(
        { error: "deal_id is required" },
        { status: 400 }
      );
    }

    const supabase = createServerClient();

    // ----- Look up trader -----
    // If trader_id is provided, use the traders table (on-chain trader with token_id).
    // Otherwise fall back to desk_managers for backward compatibility.
    let traderId: string;
    let traderName: string;
    let tokenId: bigint | null = null;

    if (trader_id) {
      const { data: trader, error: traderError } = await supabase
        .from("traders")
        .select("id, token_id, name, owner_address")
        .eq("id", trader_id)
        .single();

      if (traderError || !trader) {
        return NextResponse.json(
          { error: "Trader not found" },
          { status: 404 }
        );
      }

      if (trader.owner_address.toLowerCase() !== walletAddress.toLowerCase()) {
        return NextResponse.json(
          { error: "You do not own this trader" },
          { status: 403 }
        );
      }

      traderId = trader.id;
      traderName = trader.name || "Anonymous Trader";
      tokenId = BigInt(trader.token_id);
    } else {
      // Legacy: use desk_manager as trader
      const { data: dm, error: dmError } = await supabase
        .from("desk_managers")
        .select("id, display_name, wallet_address")
        .eq("wallet_address", walletAddress)
        .single();

      if (dmError || !dm) {
        return NextResponse.json(
          { error: "Desk manager not found. Register first." },
          { status: 404 }
        );
      }

      traderId = dm.id;
      traderName = dm.display_name || "Anonymous Trader";
    }

    // ----- Fetch deal -----
    const deal = await getDeal(deal_id);

    if (deal.status !== "open") {
      return NextResponse.json({ error: "Deal is not open" }, { status: 400 });
    }

    const onChainDealId =
      deal.on_chain_deal_id !== null && deal.on_chain_deal_id !== undefined
        ? BigInt(deal.on_chain_deal_id)
        : null;

    // ----- LLM resolution -----
    // Resolve via LLM first, before touching on-chain funds.
    // This way if the LLM call fails, no funds are deducted.
    const randomSeed = generateRandomSeed();
    const maxValuePerWin = deal.pot_usdc * (MAX_EXTRACTION_PERCENTAGE / 100);

    // Read on-chain balance for portfolio context when available
    let portfolioBalance = deal.entry_cost_usdc;
    if (tokenId !== null) {
      try {
        const publicClient = makePublicClient();
        const balance = await publicClient.readContract({
          address: ESCROW_ADDRESS,
          abi: escrowAbi,
          functionName: "getBalance",
          args: [tokenId],
        });
        portfolioBalance = Number(balance) / 1_000_000;
      } catch {
        // Fall back to entry cost as proxy
      }
    }

    const messages = await buildDealResolutionMessages({
      dealPrompt: deal.prompt,
      traderName,
      traderInventory: [], // TODO: load from assets table when built
      portfolioBalance,
      maxValuePerWin,
      randomSeed,
    });

    const outcome = await callModel<DealOutcome>(
      messages,
      DealOutcomeSchema,
      "deal_outcome"
    );

    // ----- Validate and cap the outcome -----
    let corrected = false;
    const originalBalanceChange = outcome.balance_change_usdc;

    if (outcome.balance_change_usdc > maxValuePerWin) {
      outcome.balance_change_usdc = maxValuePerWin;
      corrected = true;
    }

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
        traderName,
      });

      const correction = await callModel<{
        corrected_narrative: typeof outcome.narrative;
      }>(correctionMessages, CorrectionNarrativeSchema, "correction_narrative");

      outcome.narrative = correction.corrected_narrative;
    }

    // ----- Calculate financials -----
    let rakeAmount = 0;
    if (outcome.balance_change_usdc > 0) {
      rakeAmount = outcome.balance_change_usdc * (RAKE_PERCENTAGE / 100);
    }

    const traderPnl =
      outcome.balance_change_usdc > 0
        ? outcome.balance_change_usdc - rakeAmount
        : outcome.balance_change_usdc;

    const potChange =
      deal.entry_cost_usdc -
      (outcome.balance_change_usdc > 0 ? outcome.balance_change_usdc : 0);

    // ----- On-chain: enter deal + resolve entry -----
    // Both calls happen after LLM resolution succeeds, so a failed LLM
    // call never deducts funds from the trader's escrow balance.
    let enterTxHash: string | null = null;
    let resolveTxHash: string | null = null;

    if (onChainDealId !== null && tokenId !== null) {
      const walletClient = makeOperatorWalletClient();
      const publicClient = makePublicClient();

      // 1. Enter deal — deducts entry cost from trader balance, adds to pot
      const enterHash = await walletClient.writeContract({
        address: ESCROW_ADDRESS,
        abi: escrowAbi,
        functionName: "enterDeal",
        args: [onChainDealId, tokenId],
      });
      await publicClient.waitForTransactionReceipt({ hash: enterHash });
      enterTxHash = enterHash;

      // 2. Resolve entry — settles funds based on LLM outcome
      const pnlUnits = usdcToUnits(outcome.balance_change_usdc);
      const rakeUnits = usdcToUnits(rakeAmount);

      const resolveHash = await walletClient.writeContract({
        address: ESCROW_ADDRESS,
        abi: escrowAbi,
        functionName: "resolveEntry",
        args: [onChainDealId, tokenId, pnlUnits, rakeUnits],
      });
      await publicClient.waitForTransactionReceipt({ hash: resolveHash });
      resolveTxHash = resolveHash;
    }

    // ----- Save outcome to Supabase -----
    const dealOutcome = await createDealOutcome({
      deal_id,
      trader_id: traderId,
      narrative: outcome.narrative,
      trader_pnl_usdc: traderPnl,
      pot_change_usdc: potChange,
      rake_usdc: rakeAmount,
      assets_gained: outcome.assets_gained,
      assets_lost: outcome.assets_lost,
      trader_wiped_out: outcome.trader_wiped_out,
      wipeout_reason: outcome.wipeout_reason ?? undefined,
      on_chain_tx_hash: resolveTxHash ?? undefined,
    });

    // Update deal stats
    await updateDealAfterEntry(deal_id, potChange, outcome.trader_wiped_out);

    // ----- Post reputation (best effort, non-blocking) -----
    if (tokenId !== null) {
      // Fire and forget — don't block the response
      postReputation(
        tokenId,
        traderPnl,
        outcome.trader_wiped_out,
        deal_id,
        dealOutcome.id
      ).catch((err) => console.error("Reputation post failed:", err));
    }

    return NextResponse.json({
      outcome: dealOutcome,
      summary: {
        balance_change: outcome.balance_change_usdc,
        rake: rakeAmount,
        net_pnl: traderPnl,
        wiped_out: outcome.trader_wiped_out,
        enter_tx_hash: enterTxHash,
        resolve_tx_hash: resolveTxHash,
      },
    });
  } catch (e) {
    console.error("Deal entry error:", e);
    const message = e instanceof Error ? e.message : "Internal server error";
    const status = message.includes("not found") ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
