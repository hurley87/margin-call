import { NextRequest, NextResponse } from "next/server";
import { parseAbiItem, decodeEventLog } from "viem";
import { makePublicClient } from "@/lib/contracts/client";
import { ESCROW_ADDRESS, escrowAbi } from "@/lib/contracts/escrow";
import { createServerClient } from "@/lib/supabase/client";

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
  txHash: string
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

  const { error } = await supabase.from("deals").upsert(
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
    },
    { onConflict: "on_chain_deal_id" }
  );

  if (error) {
    console.error(`Failed to sync deal ${dealId}:`, error);
    return false;
  }
  return true;
}

/** Sync a single deal by its creation tx hash */
async function syncByTxHash(txHash: `0x${string}`) {
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
        const ok = await upsertDeal(
          supabase,
          publicClient,
          args.dealId,
          args.creator,
          args.prompt,
          args.pot,
          args.entryCost,
          txHash
        );
        return { synced: ok ? 1 : 0, dealId: Number(args.dealId) };
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

    const ok = await upsertDeal(
      supabase,
      publicClient,
      dealId,
      creator,
      prompt,
      pot,
      entryCost,
      log.transactionHash
    );
    if (ok) synced++;
  }

  return { synced, total: Number(dealCount) };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const txHash = (body as { txHash?: string }).txHash;

    if (txHash && /^0x[a-fA-F0-9]{64}$/.test(txHash)) {
      const result = await syncByTxHash(txHash as `0x${string}`);
      return NextResponse.json(result);
    }

    const result = await syncAll();
    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Sync failed";
    console.error("Deal sync error:", e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
