import { NextRequest, NextResponse } from "next/server";
import { keccak256, toBytes, parseUnits } from "viem";
import { verifyPrivyToken } from "@/lib/privy/server";
import { verifySIWARequest } from "@/lib/siwa/verify";
import { siwaAuthMatchesTrader } from "@/lib/siwa/binding";
import { createServerClient } from "@/lib/supabase/client";
import { getTrader, getOwnedTrader } from "@/lib/supabase/traders";
import {
  getDeal,
  getExistingDealOutcome,
  getTraderAssets,
  getLatestNarrative,
} from "@/lib/supabase/queries";
import { createConvexAdminClient } from "@/lib/convex/server-client";
import { internal } from "../../../../../convex/_generated/api";
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
import { getOrCreateTraderSmartAccount } from "@/lib/cdp/trader-wallet";
import {
  sendContractCall,
  sendBatchContractCalls,
} from "@/lib/cdp/send-contract-call";
import { getEscrowBalance, syncTraderEscrow } from "@/lib/contracts/balance";
import {
  getOnChainDeal,
  getNftOwner,
  DEAL_STATUS_OPEN,
} from "@/lib/contracts/on-chain";
import {
  ESCROW_ADDRESS,
  REPUTATION_REGISTRY_ADDRESS,
  escrowAbi,
  reputationRegistryAbi,
} from "@/lib/contracts/escrow";
import { makeOperatorWalletClient } from "@/lib/contracts/operator";
import { makePublicClient } from "@/lib/contracts/client";
import { randomBytes } from "crypto";
import {
  dealEnterLimit,
  checkRateLimit,
  getClientIdentifier,
} from "@/lib/rate-limit";

function generateRandomSeed(): number {
  const bytes = randomBytes(4);
  return bytes.readUInt32BE() / 0xffffffff;
}

function isPostgresDuplicateError(
  error: unknown
): error is { code: string; constraint?: string } {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string"
  );
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
  traderId: string,
  tokenId: bigint,
  pnlUsdc: number,
  wipedOut: boolean,
  dealId: string,
  outcomeId: string
) {
  try {
    // Use the operator wallet — the ERC-8004 reputation registry rejects
    // self-feedback (the NFT owner cannot rate themselves).
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
    const body = await request.json();
    const { deal_id, trader_id, _agent_cycle } = body as {
      deal_id?: string;
      trader_id?: string;
      _agent_cycle?: boolean;
    };

    if (!deal_id) {
      return NextResponse.json(
        { error: "deal_id is required" },
        { status: 400 }
      );
    }

    const supabase = createServerClient();

    // ----- Auth: Privy user or internal agent cycle -----
    let traderId: string;
    let traderName: string;
    let tokenId: bigint | null = null;
    /** Expected on-chain NFT owner when tokenId is set; used to verify before operator write. */
    let expectedOwnerAddress: string | null = null;
    /** Cached escrow balance from Supabase — used for LLM portfolio context. */
    let cachedBalanceUsdc: number | null = null;

    if (_agent_cycle && trader_id) {
      // Agent cycle call — verify SIWA (Sign In With Agent) auth
      const siwaMessageB64 = request.headers.get("x-siwa-message");
      const siwaSignature = request.headers.get("x-siwa-signature");
      if (!siwaMessageB64 || !siwaSignature) {
        return NextResponse.json(
          { error: "Missing SIWA auth headers" },
          { status: 401 }
        );
      }
      const siwaMessage = Buffer.from(siwaMessageB64, "base64").toString(
        "utf-8"
      );
      const siwaResult = await verifySIWARequest(siwaMessage, siwaSignature);
      if (!siwaResult.valid) {
        return NextResponse.json(
          { error: "Invalid SIWA auth" },
          { status: 401 }
        );
      }

      const trader = await getTrader(trader_id);
      if (!siwaAuthMatchesTrader(siwaResult, trader)) {
        return NextResponse.json(
          { error: "SIWA identity does not match trader" },
          { status: 403 }
        );
      }
      traderId = trader.id;
      traderName = trader.name || "Anonymous Trader";
      tokenId = BigInt(trader.token_id);
      expectedOwnerAddress = trader.cdp_wallet_address ?? trader.owner_address;
      cachedBalanceUsdc = trader.escrow_balance_usdc;
    } else {
      // Normal user request — verify Privy token
      const { user } = await verifyPrivyToken(request);

      const walletAddress = user.wallet?.address;
      if (!walletAddress) {
        return NextResponse.json(
          { error: "No wallet linked to this account" },
          { status: 400 }
        );
      }

      if (trader_id) {
        const trader = await getOwnedTrader(trader_id, walletAddress);
        traderId = trader.id;
        traderName = trader.name || "Anonymous Trader";
        tokenId = BigInt(trader.token_id);
        expectedOwnerAddress =
          trader.cdp_wallet_address ?? trader.owner_address;
        cachedBalanceUsdc = trader.escrow_balance_usdc;
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
    }

    // Rate limit: 10 req/min per wallet
    const rlKey = getClientIdentifier(request, expectedOwnerAddress);
    const limited = await checkRateLimit(dealEnterLimit, rlKey);
    if (limited) return limited;

    // ----- Fetch deal -----
    const deal = await getDeal(deal_id);

    if (deal.status !== "open") {
      return NextResponse.json({ error: "Deal is not open" }, { status: 400 });
    }

    const existing = await getExistingDealOutcome(deal_id, traderId);
    if (existing) {
      return NextResponse.json(
        {
          error: "Trader has already entered this deal",
          outcome_id: existing.id,
        },
        { status: 409 }
      );
    }

    const onChainDealId =
      deal.on_chain_deal_id !== null && deal.on_chain_deal_id !== undefined
        ? BigInt(deal.on_chain_deal_id)
        : null;

    // ----- Idempotency and on-chain checks (before LLM / operator writes) -----
    if (onChainDealId !== null && tokenId !== null) {
      const onChainDeal = await getOnChainDeal(onChainDealId);
      if (!onChainDeal || onChainDeal.status !== DEAL_STATUS_OPEN) {
        return NextResponse.json(
          { error: "Deal is not open on-chain" },
          { status: 400 }
        );
      }

      const balanceUsdc = await getEscrowBalance(tokenId);
      if (balanceUsdc < deal.entry_cost_usdc) {
        return NextResponse.json(
          { error: "Insufficient escrow balance" },
          { status: 400 }
        );
      }

      if (expectedOwnerAddress) {
        let currentOwner: string;
        try {
          currentOwner = await getNftOwner(tokenId);
        } catch {
          return NextResponse.json(
            { error: "Failed to verify NFT ownership (RPC error)" },
            { status: 502 }
          );
        }
        if (currentOwner.toLowerCase() !== expectedOwnerAddress.toLowerCase()) {
          return NextResponse.json(
            { error: "Trader NFT ownership changed" },
            { status: 403 }
          );
        }
      }
    }

    // ----- LLM resolution -----
    // Resolve via LLM first, before touching on-chain funds.
    // This way if the LLM call fails, no funds are deducted.
    const randomSeed = generateRandomSeed();
    const maxValuePerWin = deal.pot_usdc * (MAX_EXTRACTION_PERCENTAGE / 100);

    // Use cached Supabase balance for portfolio context (LLM narrative only)
    let portfolioBalance = deal.entry_cost_usdc;
    if (cachedBalanceUsdc !== null) {
      portfolioBalance = cachedBalanceUsdc;
    }

    // Load trader assets + latest narrative in parallel (both are LLM context)
    const [traderAssets, latestNarrative] = await Promise.all([
      getTraderAssets(traderId),
      getLatestNarrative().catch((e) => {
        console.warn("Failed to fetch narrative for deal context:", e);
        return null;
      }),
    ]);
    const traderInventory = traderAssets.map((a) => ({
      name: a.name,
      value_usdc: Number(a.value_usdc),
    }));

    // Extract world state from latest Market Wire narrative
    let worldMood: string | undefined;
    let secHeat: number | undefined;
    let activeStorylines: string[] | undefined;
    if (latestNarrative?.world_state) {
      const ws = latestNarrative.world_state as {
        mood?: string;
        sec_heat?: number;
        active_storylines?: string[];
      };
      worldMood = ws.mood;
      secHeat = ws.sec_heat;
      activeStorylines = ws.active_storylines;
    }

    const messages = await buildDealResolutionMessages({
      dealPrompt: deal.prompt,
      traderName,
      traderInventory,
      portfolioBalance,
      maxValuePerWin,
      randomSeed,
      worldMood,
      secHeat,
      activeStorylines,
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
      const { smartAccount } = await getOrCreateTraderSmartAccount(
        Number(tokenId)
      );

      const pnlUnits = usdcToUnits(outcome.balance_change_usdc);
      const rakeUnits = usdcToUnits(rakeAmount);

      // Re-read on-chain deal to get current pending entries count.
      // We already fetched it earlier for validation, but the count may
      // have changed between then and now (other traders entering).
      const currentOnChainDeal = await getOnChainDeal(onChainDealId);
      const pendingEntries = currentOnChainDeal
        ? Number(currentOnChainDeal.pendingEntries)
        : 0;

      if (pendingEntries === 0) {
        // No pending entries — safe to batch enterDeal + resolveEntry
        // atomically so the bundler doesn't simulate resolveEntry
        // against state where enterDeal hasn't been mined yet.
        const receipt = await sendBatchContractCalls(smartAccount, [
          {
            address: ESCROW_ADDRESS,
            abi: escrowAbi,
            functionName: "enterDeal",
            args: [onChainDealId, tokenId],
          },
          {
            address: ESCROW_ADDRESS,
            abi: escrowAbi,
            functionName: "resolveEntry",
            args: [onChainDealId, tokenId, pnlUnits, rakeUnits],
          },
        ]);
        enterTxHash = receipt.transactionHash;
        resolveTxHash = receipt.transactionHash;
      } else {
        // Other traders have pending (unresolved) entries in the FIFO
        // queue. resolveEntry checks queue[0] == traderId, so we can't
        // batch — just enter the deal now; resolution will happen once
        // earlier entries are resolved and this trader reaches the head.
        const enterReceipt = await sendContractCall(smartAccount, {
          address: ESCROW_ADDRESS,
          abi: escrowAbi,
          functionName: "enterDeal",
          args: [onChainDealId, tokenId],
        });
        enterTxHash = enterReceipt.transactionHash;
      }
    }

    // ----- Record verified entry in Convex (single writer path, idempotent) -----
    // paymentId is derived from the on-chain enter tx hash when available,
    // otherwise from a deterministic key scoped to (traderId, dealId).
    // This is the ONLY path that writes paid/verified entry state to Convex;
    // no public mutation accepts these fields from client input.
    const paymentId = enterTxHash ?? `noop:${traderId}:${deal_id}`;
    const chainDealId =
      onChainDealId !== null ? Number(onChainDealId) : undefined;

    try {
      const convex = createConvexAdminClient();
      // The admin client calls an internalMutation via the deploy key.
      // ConvexHttpClient.mutation() types restrict to public functions, but
      // setAdminAuth() grants internal access at runtime. We cast the internal
      // function reference to the public variant to satisfy the TypeScript
      // overload while keeping the runtime behaviour correct.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const recordFn = internal.deals.recordVerifiedEntry as any;
      await convex.mutation(recordFn, {
        paymentId,
        // deal_id is a Convex Id<"deals"> serialised as a plain string from
        // the request body — safe to cast here.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        dealId: deal_id as any,
        traderId,
        entryCostUsdc: deal.entry_cost_usdc,
        enterTxHash: enterTxHash ?? undefined,
        resolveTxHash: resolveTxHash ?? undefined,
        onChainDealId: chainDealId,
        traderPnlUsdc: traderPnl,
        rakeUsdc: rakeAmount,
        traderWipedOut: outcome.trader_wiped_out,
      });
    } catch (convexErr) {
      // Log but don't fail the request — Supabase is still the authoritative
      // store during the migration window (#91 removes Supabase fully).
      console.error(
        "[deal/enter] Convex recordVerifiedEntry failed:",
        convexErr
      );
    }

    // Keep cached trader escrow in Supabase aligned with chain state after entry/resolve.
    if (tokenId !== null) {
      await syncTraderEscrow(traderId, tokenId, "deal entry");
    }

    // ----- Post reputation (best effort, non-blocking) -----
    if (tokenId !== null) {
      // Fire and forget — don't block the response.
      // Use paymentId as the stable outcome reference (replaces Supabase outcome id).
      postReputation(
        traderId,
        tokenId,
        traderPnl,
        outcome.trader_wiped_out,
        deal_id,
        paymentId
      ).catch((err) => console.error("Reputation post failed:", err));
    }

    return NextResponse.json({
      outcome: {
        trader_pnl_usdc: traderPnl,
        rake_usdc: rakeAmount,
        pot_change_usdc: potChange,
        narrative: outcome.narrative,
        assets_gained: outcome.assets_gained,
        assets_lost: outcome.assets_lost,
        trader_wiped_out: outcome.trader_wiped_out,
        wipeout_reason: outcome.wipeout_reason ?? null,
        on_chain_tx_hash: resolveTxHash ?? null,
        payment_id: paymentId,
      },
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
    if (
      isPostgresDuplicateError(e) &&
      e.code === "23505" &&
      e.constraint === "deal_outcomes_trader_id_deal_id_unique"
    ) {
      return NextResponse.json(
        { error: "Trader has already entered this deal" },
        { status: 409 }
      );
    }
    const message = e instanceof Error ? e.message : "Internal server error";
    const status = message.includes("not found") ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
