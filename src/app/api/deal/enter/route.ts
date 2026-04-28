import { NextRequest, NextResponse } from "next/server";
import { keccak256, toBytes, parseUnits, getAddress } from "viem";
import { verifyPrivyToken } from "@/lib/privy/server";
import { verifySIWARequest } from "@/lib/siwa/verify";
import { createConvexAdminClient } from "@/lib/convex/server-client";
import { internal } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
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
import { getEscrowBalance } from "@/lib/contracts/balance";
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

/** Convert USDC amount (human-readable) to on-chain 6-decimal BigInt */
function usdcToUnits(amount: number): bigint {
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
    const walletClient = makeOperatorWalletClient();
    const publicClient = makePublicClient();

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

    const convex = createConvexAdminClient();

    // Helper: call an internal Convex query via the admin client.
    // ConvexHttpClient.query() types restrict to public functions, but
    // setAdminAuth() grants internal access at runtime.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const callInternal = (fn: unknown, args: unknown) =>
      (
        convex as unknown as {
          query(fn: unknown, args: unknown): Promise<unknown>;
        }
      ).query(fn, args);

    // ----- Auth: Privy user or internal agent cycle -----
    let traderId: string;
    let traderName: string;
    let tokenId: bigint | null = null;
    /** Expected on-chain NFT owner when tokenId is set; used to verify before operator write. */
    let expectedOwnerAddress: string | null = null;
    /** Cached escrow balance — used for LLM portfolio context. */
    let cachedBalanceUsdc: number | null = null;
    /** Convex trader Id for internal mutation calls (when trader is Convex-native). */
    let convexTraderId: Id<"traders"> | null = null;

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

      // Load trader from Convex by string id (Convex Id<"traders"> is a string)
      const traderRaw = (await callInternal(internal.traders.loadInternal, {
        traderId: trader_id as Id<"traders">,
      })) as {
        _id: Id<"traders">;
        name: string;
        tokenId?: number;
        cdpWalletAddress?: string;
        cdpOwnerAddress?: string;
        escrowBalanceUsdc?: number;
        status: string;
      } | null;

      if (!traderRaw) {
        return NextResponse.json(
          { error: "Trader not found" },
          { status: 404 }
        );
      }

      // SIWA binding check (inline to handle Convex camelCase fields)
      if (
        siwaResult.agentId === undefined ||
        Number(siwaResult.agentId) !== traderRaw.tokenId
      ) {
        return NextResponse.json(
          { error: "SIWA identity does not match trader (agentId mismatch)" },
          { status: 403 }
        );
      }
      if (
        !siwaResult.address ||
        !traderRaw.cdpWalletAddress ||
        getAddress(siwaResult.address) !==
          getAddress(traderRaw.cdpWalletAddress)
      ) {
        return NextResponse.json(
          { error: "SIWA identity does not match trader (address mismatch)" },
          { status: 403 }
        );
      }

      convexTraderId = traderRaw._id;
      traderId = traderRaw._id as string;
      traderName = traderRaw.name || "Anonymous Trader";
      tokenId =
        traderRaw.tokenId !== undefined ? BigInt(traderRaw.tokenId) : null;
      expectedOwnerAddress =
        traderRaw.cdpWalletAddress ?? traderRaw.cdpOwnerAddress ?? null;
      cachedBalanceUsdc = traderRaw.escrowBalanceUsdc ?? null;
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

      if (!trader_id) {
        return NextResponse.json(
          { error: "trader_id is required" },
          { status: 400 }
        );
      }

      // Load trader from Convex, verifying ownership via deskManager walletAddress
      const traderRaw = (await callInternal(
        internal.traders.getByIdForOwnerInternal,
        {
          traderId: trader_id as Id<"traders">,
          walletAddress,
        }
      )) as {
        _id: Id<"traders">;
        name: string;
        tokenId?: number;
        cdpWalletAddress?: string;
        cdpOwnerAddress?: string;
        escrowBalanceUsdc?: number;
        status: string;
      } | null;

      if (!traderRaw) {
        return NextResponse.json(
          {
            error: "Trader not found or you do not own this trader",
          },
          { status: 404 }
        );
      }

      convexTraderId = traderRaw._id;
      traderId = traderRaw._id as string;
      traderName = traderRaw.name || "Anonymous Trader";
      tokenId =
        traderRaw.tokenId !== undefined ? BigInt(traderRaw.tokenId) : null;
      expectedOwnerAddress =
        traderRaw.cdpWalletAddress ?? traderRaw.cdpOwnerAddress ?? null;
      cachedBalanceUsdc = traderRaw.escrowBalanceUsdc ?? null;
    }

    // Rate limit: 10 req/min per wallet
    const rlKey = getClientIdentifier(request, expectedOwnerAddress);
    const limited = await checkRateLimit(dealEnterLimit, rlKey);
    if (limited) return limited;

    // ----- Fetch deal from Convex -----
    const deal = (await callInternal(internal.deals.loadInternal, {
      dealId: deal_id as Id<"deals">,
    })) as {
      _id: Id<"deals">;
      status: string;
      prompt: string;
      potUsdc: number;
      entryCostUsdc: number;
      onChainDealId?: number;
      maxExtractionPercentage?: number;
    } | null;

    if (!deal) {
      return NextResponse.json({ error: "Deal not found" }, { status: 404 });
    }

    if (deal.status !== "open") {
      return NextResponse.json({ error: "Deal is not open" }, { status: 400 });
    }

    // ----- Idempotency: check for existing entry -----
    const existingEntry = (await callInternal(
      internal.deals.findEntryByTraderAndDeal,
      {
        traderId,
        dealId: deal_id as Id<"deals">,
      }
    )) as { _id: string } | null;

    if (existingEntry) {
      return NextResponse.json(
        {
          error: "Trader has already entered this deal",
          outcome_id: existingEntry._id,
        },
        { status: 409 }
      );
    }

    const onChainDealId =
      deal.onChainDealId !== null && deal.onChainDealId !== undefined
        ? BigInt(deal.onChainDealId)
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
      if (balanceUsdc < deal.entryCostUsdc) {
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
    const randomSeed = generateRandomSeed();
    const maxValuePerWin =
      deal.potUsdc *
      ((deal.maxExtractionPercentage ?? MAX_EXTRACTION_PERCENTAGE) / 100);

    let portfolioBalance = deal.entryCostUsdc;
    if (cachedBalanceUsdc !== null) {
      portfolioBalance = cachedBalanceUsdc;
    }

    // Load trader assets + latest narrative from Convex in parallel
    const [traderAssetsRaw, latestNarrativeRaw] = await Promise.all([
      callInternal(internal.assets.listForTraderInternal, {
        traderId: convexTraderId ?? (traderId as Id<"traders">),
      }).catch(() => []),
      callInternal(internal.marketNarratives.getLatestInternal, {}).catch(
        (e) => {
          console.warn("Failed to fetch narrative for deal context:", e);
          return null;
        }
      ),
    ]);

    const traderAssets =
      (traderAssetsRaw as {
        name: string;
        valueUsdc?: number;
        value_usdc?: number;
      }[]) ?? [];
    const traderInventory = traderAssets.map((a) => ({
      name: a.name,
      value_usdc: Number(a.valueUsdc ?? a.value_usdc ?? 0),
    }));

    const latestNarrative = latestNarrativeRaw as {
      worldState?: {
        mood?: string;
        sec_heat?: number;
        active_storylines?: string[];
      };
    } | null;

    let worldMood: string | undefined;
    let secHeat: number | undefined;
    let activeStorylines: string[] | undefined;
    if (latestNarrative?.worldState) {
      const ws = latestNarrative.worldState;
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

    if (outcome.balance_change_usdc < -deal.entryCostUsdc) {
      outcome.balance_change_usdc = -deal.entryCostUsdc;
      corrected = true;
    }

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
      deal.entryCostUsdc -
      (outcome.balance_change_usdc > 0 ? outcome.balance_change_usdc : 0);

    // ----- On-chain: enter deal + resolve entry -----
    let enterTxHash: string | null = null;
    let resolveTxHash: string | null = null;

    if (onChainDealId !== null && tokenId !== null) {
      const { smartAccount } = await getOrCreateTraderSmartAccount(
        Number(tokenId)
      );

      const pnlUnits = usdcToUnits(outcome.balance_change_usdc);
      const rakeUnits = usdcToUnits(rakeAmount);

      const currentOnChainDeal = await getOnChainDeal(onChainDealId);
      const pendingEntries = currentOnChainDeal
        ? Number(currentOnChainDeal.pendingEntries)
        : 0;

      if (pendingEntries === 0) {
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
    const paymentId = enterTxHash ?? `noop:${traderId}:${deal_id}`;
    const chainDealId =
      onChainDealId !== null ? Number(onChainDealId) : undefined;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const recordFn = internal.deals.recordVerifiedEntry as any;
    await convex.mutation(recordFn, {
      paymentId,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      dealId: deal_id as any,
      traderId,
      entryCostUsdc: deal.entryCostUsdc,
      enterTxHash: enterTxHash ?? undefined,
      resolveTxHash: resolveTxHash ?? undefined,
      onChainDealId: chainDealId,
      traderPnlUsdc: traderPnl,
      rakeUsdc: rakeAmount,
      traderWipedOut: outcome.trader_wiped_out,
    });

    // ----- Sync trader escrow balance in Convex after entry/resolve -----
    if (tokenId !== null && convexTraderId !== null) {
      try {
        const latestEscrowUsdc = await getEscrowBalance(tokenId);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const updateFn = internal.traders.updateEscrowBalance as any;
        await convex.mutation(updateFn, {
          traderId: convexTraderId,
          escrowBalanceUsdc: latestEscrowUsdc,
        });
      } catch (syncErr) {
        console.error("[deal/enter] Failed to sync escrow balance:", syncErr);
      }
    }

    // ----- Post reputation (best effort, non-blocking) -----
    if (tokenId !== null) {
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
    const message = e instanceof Error ? e.message : "Internal server error";
    const status = message.includes("not found") ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
