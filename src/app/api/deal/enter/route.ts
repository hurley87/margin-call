import { NextRequest, NextResponse } from "next/server";
import { verifySIWARequest } from "@/lib/siwa/verify";
import { siwaAuthMatchesConvexTrader } from "@/lib/siwa/binding";
import { createConvexAdminClient } from "@/lib/convex/server-client";
import { internal } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { sendOperatorContractCall } from "@/lib/contracts/operator";
import { getEscrowBalance } from "@/lib/contracts/balance";
import {
  getOnChainDeal,
  getNftOwner,
  DEAL_STATUS_OPEN,
} from "@/lib/contracts/on-chain";
import { ESCROW_ADDRESS, escrowAbi } from "@/lib/contracts/escrow";
import {
  dealEnterLimit,
  checkRateLimit,
  getClientIdentifier,
} from "@/lib/rate-limit";
import { isTraderEligibleToEnterDealByDesk } from "@/lib/deal-entry-eligibility";
import {
  getTradingHoursState,
  marketClosedMessage,
} from "../../../../../convex/lib/tradingHours";

const LEGACY_PRIVY_ENTRY_MESSAGE =
  "Deprecated: Privy + Supabase deal enter has been removed; use Convex-backed flows. Agent cycles still use this route with SIWA (`_agent_cycle: true`).";

/**
 * Convex agent cycle: on-chain deal **entry** + `dealEntries` write only.
 * Outcome resolution lives in `internal.agent.cycle` (Convex LLM + mutations).
 */
async function handleAgentCycleDealEnter(
  request: NextRequest,
  params: { deal_id: string; trader_id: string }
): Promise<NextResponse> {
  const { deal_id, trader_id } = params;

  const siwaMessageB64 = request.headers.get("x-siwa-message");
  const siwaSignature = request.headers.get("x-siwa-signature");
  if (!siwaMessageB64 || !siwaSignature) {
    return NextResponse.json(
      { error: "Missing SIWA auth headers" },
      { status: 401 }
    );
  }
  const siwaMessage = Buffer.from(siwaMessageB64, "base64").toString("utf-8");
  const siwaResult = await verifySIWARequest(siwaMessage, siwaSignature);
  if (!siwaResult.valid) {
    return NextResponse.json(
      { error: `Invalid SIWA auth: ${siwaResult.error ?? "unknown"}` },
      { status: 401 }
    );
  }

  // Trading-hours gate (spec §5, §7.2). Runs after SIWA so unauthorised
  // callers still hit 401 first, but before any Convex/RPC work so we
  // don't burn quota when the market is closed.
  const marketState = getTradingHoursState();
  if (!marketState.isOpen) {
    const nextOpenAt = marketState.nextOpenAt;
    const retryAfterSeconds =
      typeof nextOpenAt === "number"
        ? Math.max(0, Math.ceil((nextOpenAt - Date.now()) / 1000))
        : 0;
    return NextResponse.json(
      {
        error: "market_closed",
        message: marketClosedMessage(),
        next_open_at:
          typeof nextOpenAt === "number"
            ? new Date(nextOpenAt).toISOString()
            : null,
      },
      {
        status: 423,
        headers: { "Retry-After": String(retryAfterSeconds) },
      }
    );
  }

  const convex = createConvexAdminClient();
  // ConvexHttpClient typings only cover public functions; admin auth allows internal.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const loadTraderFn = internal.traders.loadInternal as any;
  const trader = (await convex.query(loadTraderFn, {
    traderId: trader_id as Id<"traders">,
  })) as {
    deskManagerId: Id<"deskManagers">;
    tokenId?: number;
    cdpWalletAddress?: string;
    cdpOwnerAddress?: string;
    walletStatus?: string;
  } | null;

  if (!trader) {
    return NextResponse.json({ error: "Trader not found" }, { status: 404 });
  }

  if (!siwaAuthMatchesConvexTrader(siwaResult, trader)) {
    return NextResponse.json(
      { error: "SIWA identity does not match trader" },
      { status: 403 }
    );
  }

  if (trader.walletStatus !== "ready") {
    return NextResponse.json(
      { error: "Trader wallet is not ready" },
      { status: 400 }
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const loadDealFn = internal.deals.loadInternal as any;
  const deal = (await convex.query(loadDealFn, {
    dealId: deal_id as Id<"deals">,
  })) as {
    status: string;
    prompt: string;
    potUsdc: number;
    entryCostUsdc: number;
    onChainDealId?: number | null;
    creatorDeskManagerId?: Id<"deskManagers">;
  } | null;

  if (!deal) {
    return NextResponse.json({ error: "Deal not found" }, { status: 404 });
  }

  const rlKey = getClientIdentifier(request, trader.cdpWalletAddress ?? null);
  const limited = await checkRateLimit(dealEnterLimit, rlKey);
  if (limited) return limited;

  if (deal.status !== "open") {
    return NextResponse.json({ error: "Deal is not open" }, { status: 400 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const findEntryFn = internal.deals.findVerifiedEntryByTraderAndDeal as any;
  const existingEntry = (await convex.query(findEntryFn, {
    traderId: trader_id,
    dealId: deal_id as Id<"deals">,
  })) as { paymentId: string } | null;

  if (existingEntry && !existingEntry.paymentId.startsWith("pending:")) {
    return NextResponse.json({
      agent_cycle: true,
      entry: {
        payment_id: existingEntry.paymentId,
        already_entered: true,
      },
      summary: {
        enter_tx_hash: null,
        resolve_tx_hash: null,
      },
    });
  }

  if (
    !isTraderEligibleToEnterDealByDesk(
      { creatorDeskManagerId: deal.creatorDeskManagerId ?? null },
      { deskManagerId: String(trader.deskManagerId) }
    )
  ) {
    return NextResponse.json(
      {
        error: "Trader cannot enter deals created by its own desk.",
      },
      { status: 403 }
    );
  }

  const onChainDealId =
    deal.onChainDealId !== null && deal.onChainDealId !== undefined
      ? BigInt(deal.onChainDealId)
      : null;

  const tokenId =
    trader.tokenId !== null && trader.tokenId !== undefined
      ? BigInt(trader.tokenId)
      : null;

  if (onChainDealId !== null && tokenId === null) {
    return NextResponse.json(
      { error: "Trader tokenId is not set — cannot enter on-chain deal" },
      { status: 400 }
    );
  }

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

    if (trader.cdpWalletAddress) {
      let currentOwner: string;
      try {
        currentOwner = await getNftOwner(tokenId);
      } catch {
        return NextResponse.json(
          { error: "Failed to verify NFT ownership (RPC error)" },
          { status: 502 }
        );
      }
      if (
        currentOwner.toLowerCase() !== trader.cdpWalletAddress.toLowerCase()
      ) {
        return NextResponse.json(
          { error: "Trader NFT ownership changed" },
          { status: 403 }
        );
      }
    }
  }

  let enterTxHash: string | null = null;

  if (onChainDealId !== null && tokenId !== null) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const beginFn = internal.deals.beginEntryRecording as any;
      const claim = (await convex.mutation(beginFn, {
        dealId: deal_id as Id<"deals">,
        traderId: trader_id,
        entryCostUsdc: deal.entryCostUsdc,
        onChainDealId: Number(onChainDealId),
      })) as {
        alreadyClaimed: boolean;
        paymentId: string;
      };

      if (claim.alreadyClaimed && !claim.paymentId.startsWith("pending:")) {
        return NextResponse.json({
          agent_cycle: true,
          entry: {
            payment_id: claim.paymentId,
            already_entered: true,
          },
          summary: {
            enter_tx_hash: null,
            resolve_tx_hash: null,
          },
        });
      }

      if (!claim.alreadyClaimed || claim.paymentId.startsWith("pending:")) {
        const enterReceipt = await sendOperatorContractCall({
          address: ESCROW_ADDRESS,
          abi: escrowAbi,
          functionName: "enterDeal",
          args: [onChainDealId, tokenId],
        });
        enterTxHash = enterReceipt.transactionHash;
      }
    } catch (enterErr) {
      const message =
        enterErr instanceof Error ? enterErr.message : String(enterErr);
      if (message.includes("Already entered")) {
        const existingAfterChain = (await convex.query(findEntryFn, {
          traderId: trader_id,
          dealId: deal_id as Id<"deals">,
        })) as { paymentId: string } | null;
        if (existingAfterChain) {
          // If the row is still pending (chain entry exists from a prior
          // partial-success but Convex never upgraded), promote it now so
          // future cycles don't re-enter this branch and burn operator gas.
          let exposedPaymentId = existingAfterChain.paymentId;
          if (existingAfterChain.paymentId.startsWith("pending:")) {
            const promotedPaymentId = `noop:${trader_id}:${deal_id}`;
            try {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const recordFn = internal.deals.recordVerifiedEntry as any;
              await convex.mutation(recordFn, {
                paymentId: promotedPaymentId,
                dealId: deal_id as Id<"deals">,
                traderId: trader_id,
                entryCostUsdc: deal.entryCostUsdc,
                enterTxHash: undefined,
                resolveTxHash: undefined,
                onChainDealId:
                  onChainDealId !== null ? Number(onChainDealId) : undefined,
              });
              exposedPaymentId = promotedPaymentId;
            } catch (promoteErr) {
              console.error(
                "[deal/enter] failed to promote pending row after 'Already entered':",
                promoteErr
              );
            }
          }
          return NextResponse.json({
            agent_cycle: true,
            entry: {
              payment_id: exposedPaymentId,
              already_entered: true,
            },
            summary: { enter_tx_hash: null, resolve_tx_hash: null },
          });
        }
      }
      // The contract rejects entering a deal created by the trader's own desk
      // (depositor wallet == deal creator). Surface it as a non-retryable 422 so
      // the agent cycle skips this deal cleanly instead of erroring on a 500.
      if (message.includes("Own desk entry")) {
        return NextResponse.json(
          {
            error:
              "Own desk entry — a trader may not enter a deal created by its own desk",
          },
          { status: 422 }
        );
      }
      throw enterErr;
    }
  }

  const paymentId = enterTxHash ?? `noop:${trader_id}:${deal_id}`;
  const chainDealId =
    onChainDealId !== null ? Number(onChainDealId) : undefined;

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const recordFn = internal.deals.recordVerifiedEntry as any;
    await convex.mutation(recordFn, {
      paymentId,
      dealId: deal_id as Id<"deals">,
      traderId: trader_id,
      entryCostUsdc: deal.entryCostUsdc,
      enterTxHash: enterTxHash ?? undefined,
      resolveTxHash: undefined,
      onChainDealId: chainDealId,
    });
  } catch (convexErr) {
    console.error(
      "[deal/enter agent_cycle] Convex recordVerifiedEntry failed:",
      convexErr
    );
    return NextResponse.json(
      { error: "Failed to record verified entry in Convex" },
      { status: 500 }
    );
  }

  return NextResponse.json({
    agent_cycle: true,
    entry: {
      payment_id: paymentId,
      already_entered: false,
    },
    summary: {
      enter_tx_hash: enterTxHash,
      resolve_tx_hash: null,
    },
  });
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

    if (_agent_cycle && trader_id) {
      return await handleAgentCycleDealEnter(request, {
        deal_id,
        trader_id,
      });
    }

    return NextResponse.json(
      { error: LEGACY_PRIVY_ENTRY_MESSAGE },
      { status: 410 }
    );
  } catch (e) {
    console.error("Deal entry error:", e);
    const message = e instanceof Error ? e.message : "Internal server error";
    const status = message.includes("not found") ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
