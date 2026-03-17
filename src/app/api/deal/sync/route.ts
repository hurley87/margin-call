import { NextRequest, NextResponse } from "next/server";
import { parseAbiItem, decodeEventLog } from "viem";
import { makePublicClient } from "@/lib/contracts/client";
import { ESCROW_ADDRESS, escrowAbi } from "@/lib/contracts/escrow";
import { createServerClient } from "@/lib/supabase/client";
import { getPrivyWalletAddress, verifyPrivyToken } from "@/lib/privy/server";

const DEAL_CREATED_EVENT = parseAbiItem(
  "event DealCreated(uint256 indexed dealId, address indexed creator, string prompt, uint256 pot, uint256 entryCost)"
);

async function upsertDeal(
  supabase: ReturnType<typeof createServerClient>,
  publicClient: ReturnType<typeof makePublicClient>,
  dealId: bigint,
  creator: string,
  prompt: string,
  pot: bigint,
  entryCost: bigint,
  txHash: string,
  sourceHeadline?: string
) {
  const deal = await publicClient.readContract({
    address: ESCROW_ADDRESS,
    abi: escrowAbi,
    functionName: "getDeal",
    args: [dealId],
  });

  const entryCostUsdc = Number(entryCost) / 1_000_000;
  const feeUsdc = Number(deal.fee) / 1_000_000;
  // pot from the event is already net of fee (matches getDeal().potAmount)
  const netPotUsdc = Number(pot) / 1_000_000;
  const status = deal.status === 0 ? "open" : "closed";

  const { data: row, error } = await supabase
    .from("deals")
    .upsert(
      {
        on_chain_deal_id: Number(dealId),
        creator_address: creator.toLowerCase(),
        creator_type: "desk_manager" as const,
        prompt,
        pot_usdc: netPotUsdc,
        entry_cost_usdc: entryCostUsdc,
        fee_usdc: feeUsdc,
        status,
        max_extraction_percentage: 25,
        entry_count: Number(deal.pendingEntries),
        wipeout_count: 0,
        on_chain_tx_hash: txHash,
        ...(sourceHeadline ? { source_headline: sourceHeadline } : {}),
      },
      { onConflict: "on_chain_deal_id" }
    )
    .select("id")
    .single();

  if (error) {
    console.error(`Failed to sync deal ${dealId}:`, error);
    return null;
  }
  return row.id as string;
}

/** Sync a single deal by its creation tx hash */
async function syncByTxHash(
  txHash: `0x${string}`,
  sourceHeadline?: string,
  expectedCreatorAddress?: string
) {
  const publicClient = makePublicClient();
  const supabase = createServerClient();

  const receipt = await publicClient.waitForTransactionReceipt({
    hash: txHash,
  });

  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== ESCROW_ADDRESS.toLowerCase()) continue;
    try {
      const decoded = decodeEventLog({
        abi: escrowAbi,
        data: log.data,
        topics: log.topics,
      });
      if (decoded.eventName === "DealCreated") {
        const args = decoded.args as {
          dealId: bigint;
          creator: `0x${string}`;
          prompt: string;
          pot: bigint;
          entryCost: bigint;
        };
        if (
          expectedCreatorAddress &&
          args.creator.toLowerCase() !== expectedCreatorAddress.toLowerCase()
        ) {
          return { synced: 0, error: "Forbidden: deal creator mismatch" };
        }
        const supabaseId = await upsertDeal(
          supabase,
          publicClient,
          args.dealId,
          args.creator,
          args.prompt,
          args.pot,
          args.entryCost,
          txHash,
          sourceHeadline
        );
        return {
          synced: supabaseId ? 1 : 0,
          dealId: Number(args.dealId),
          supabaseId,
        };
      }
    } catch {
      // not our event
    }
  }

  return { synced: 0, error: "No DealCreated event found in transaction" };
}

/** Bulk sync all recent deals from event logs */
async function syncAll() {
  const publicClient = makePublicClient();
  const supabase = createServerClient();

  const dealCount = await publicClient.readContract({
    address: ESCROW_ADDRESS,
    abi: escrowAbi,
    functionName: "dealCount",
  });

  if (dealCount === BigInt(0)) {
    return { synced: 0, total: 0 };
  }

  const currentBlock = await publicClient.getBlockNumber();
  const fromBlock =
    currentBlock > BigInt(10000) ? currentBlock - BigInt(10000) : BigInt(0);

  const logs = await publicClient.getLogs({
    address: ESCROW_ADDRESS,
    event: DEAL_CREATED_EVENT,
    fromBlock,
    toBlock: "latest",
  });

  let synced = 0;

  for (const log of logs) {
    const { dealId, creator, prompt, pot, entryCost } = log.args;
    if (
      dealId === undefined ||
      creator === undefined ||
      prompt === undefined ||
      pot === undefined ||
      entryCost === undefined
    ) {
      continue;
    }

    const supabaseId = await upsertDeal(
      supabase,
      publicClient,
      dealId,
      creator,
      prompt,
      pot,
      entryCost,
      log.transactionHash
    );
    if (supabaseId) synced++;
  }

  return { synced, total: Number(dealCount) };
}

/** Read on-chain deal state and return derived status fields. */
async function readDealState(
  publicClient: ReturnType<typeof makePublicClient>,
  dealIdBigInt: bigint
) {
  const deal = await publicClient.readContract({
    address: ESCROW_ADDRESS,
    abi: escrowAbi,
    functionName: "getDeal",
    args: [dealIdBigInt],
  });
  return {
    status: (deal.status === 0 ? "open" : "closed") as "open" | "closed",
    potUsdc: Number(deal.potAmount) / 1_000_000,
    entryCount: Number(deal.pendingEntries),
  };
}

/** Sync a single deal by on-chain ID (e.g. after closeDeal). Updates status, pot, entry count from chain.
 *  Safe to call without auth — only reads chain state and writes to DB. */
async function syncDealByOnChainId(
  onChainDealId: number,
  txHash?: `0x${string}`
) {
  const publicClient = makePublicClient();
  const supabase = createServerClient();

  const dealIdBigInt = BigInt(onChainDealId);
  let status: "open" | "closed";
  let potUsdc: number;
  let entryCount: number;

  if (txHash) {
    const receipt = await publicClient.waitForTransactionReceipt({
      hash: txHash,
      timeout: 30_000,
    });
    const hasDealClosedEvent = receipt.logs.some((log) => {
      if (log.address.toLowerCase() !== ESCROW_ADDRESS.toLowerCase())
        return false;
      try {
        const decoded = decodeEventLog({
          abi: escrowAbi,
          data: log.data,
          topics: log.topics,
        });
        return (
          decoded.eventName === "DealClosed" &&
          "dealId" in decoded.args &&
          decoded.args.dealId === dealIdBigInt
        );
      } catch {
        return false;
      }
    });
    if (receipt.status === "success" && hasDealClosedEvent) {
      status = "closed";
      potUsdc = 0;
      entryCount = 0;
    } else {
      ({ status, potUsdc, entryCount } = await readDealState(
        publicClient,
        dealIdBigInt
      ));
    }
  } else {
    ({ status, potUsdc, entryCount } = await readDealState(
      publicClient,
      dealIdBigInt
    ));
  }

  const { data, error } = await supabase
    .from("deals")
    .update({
      status,
      pot_usdc: potUsdc,
      entry_count: entryCount,
    })
    .eq("on_chain_deal_id", onChainDealId)
    .select("id, status, pot_usdc, entry_count")
    .single();

  if (error) {
    console.error(`Failed to sync deal ${onChainDealId}:`, error);
    return { synced: 0, error: error.message };
  }
  return {
    synced: 1,
    dealId: data?.id,
    status,
    pot_usdc: potUsdc,
    entry_count: entryCount,
  };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const {
      txHash,
      on_chain_deal_id: onChainDealId,
      source_headline: sourceHeadline,
    } = body as {
      txHash?: string;
      on_chain_deal_id?: number;
      source_headline?: string;
    };

    // syncDealByOnChainId is safe without auth — it only reads chain state
    // and syncs to DB. This avoids silent failures when Privy tokens expire
    // (e.g. after closeDeal tx confirms).
    if (
      onChainDealId !== undefined &&
      Number.isInteger(onChainDealId) &&
      onChainDealId >= 0
    ) {
      const result = await syncDealByOnChainId(
        onChainDealId,
        txHash && /^0x[a-fA-F0-9]{64}$/.test(txHash)
          ? (txHash as `0x${string}`)
          : undefined
      );
      if (result.error === "Deal not found") {
        return NextResponse.json({ error: result.error }, { status: 404 });
      }
      return NextResponse.json(result);
    }

    // All other paths require auth
    const operatorSecret = request.headers.get("x-operator-secret");
    const isOperator = Boolean(
      process.env.OPERATOR_SECRET &&
      operatorSecret === process.env.OPERATOR_SECRET
    );

    let walletAddress: string | undefined;
    if (!isOperator) {
      const { user } = await verifyPrivyToken(request);
      const linkedWallet = getPrivyWalletAddress(user);
      if (!linkedWallet) {
        return NextResponse.json(
          { error: "No wallet linked to this account" },
          { status: 400 }
        );
      }
      walletAddress = linkedWallet;
    }

    if (
      sourceHeadline !== undefined &&
      (typeof sourceHeadline !== "string" || sourceHeadline.length > 200)
    ) {
      return NextResponse.json(
        { error: "source_headline must be a string up to 200 chars" },
        { status: 400 }
      );
    }

    if (txHash && /^0x[a-fA-F0-9]{64}$/.test(txHash)) {
      const result = await syncByTxHash(
        txHash as `0x${string}`,
        sourceHeadline,
        isOperator ? undefined : walletAddress
      );
      if (result.error?.startsWith("Forbidden")) {
        return NextResponse.json({ error: result.error }, { status: 403 });
      }
      return NextResponse.json(result);
    }

    if (!isOperator) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const result = await syncAll();
    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Sync failed";
    const status = message.includes("Authorization header") ? 401 : 500;
    console.error("Deal sync error:", e);
    return NextResponse.json({ error: message }, { status });
  }
}
