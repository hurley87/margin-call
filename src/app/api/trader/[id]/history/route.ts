import { NextRequest, NextResponse } from "next/server";
import { decodeEventLog, parseAbiItem, encodeEventTopics } from "viem";
import { makePublicClient } from "@/lib/contracts/client";
import { ESCROW_ADDRESS, escrowAbi } from "@/lib/contracts/escrow";
import { getOwnedTrader } from "@/lib/supabase/traders";
import { getPrivyWalletAddress, verifyPrivyToken } from "@/lib/privy/server";

const DEPOSIT_EVENT = parseAbiItem(
  "event Deposit(uint256 indexed traderId, uint256 amount)"
);
const WITHDRAWAL_EVENT = parseAbiItem(
  "event Withdrawal(uint256 indexed traderId, uint256 amount)"
);

// Pre-compute event topic hashes (used for raw eth_getLogs filtering)
const DEAL_ENTERED_TOPIC = encodeEventTopics({
  abi: escrowAbi,
  eventName: "DealEntered",
})[0]!;
const ENTRY_RESOLVED_TOPIC = encodeEventTopics({
  abi: escrowAbi,
  eventName: "EntryResolved",
})[0]!;

interface HistoryEvent {
  type: "deposit" | "withdrawal" | "enter" | "resolve";
  block: number;
  txHash: string;
  amount?: number;
  dealId?: number;
  pnl?: number;
  rake?: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function decodeRawLog(log: any) {
  return decodeEventLog({
    abi: escrowAbi,
    data: log.data as `0x${string}`,
    topics: log.topics as [`0x${string}`, ...`0x${string}`[]],
  });
}

/**
 * GET /api/trader/[id]/history
 * Returns on-chain transaction history for a trader.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await verifyPrivyToken(request);
    const walletAddress = getPrivyWalletAddress(user);
    if (!walletAddress) {
      return NextResponse.json(
        { error: "No wallet linked to this account" },
        { status: 400 }
      );
    }

    const { id } = await params;
    const trader = await getOwnedTrader(id, walletAddress);

    const tokenId = BigInt(trader.token_id);
    const traderIdTopic =
      `0x${tokenId.toString(16).padStart(64, "0")}` as `0x${string}`;

    const publicClient = makePublicClient();
    const currentBlock = await publicClient.getBlockNumber();

    const scanRange = BigInt(5_000);
    const fromBlock =
      currentBlock > scanRange ? currentBlock - scanRange : BigInt(0);

    const events: HistoryEvent[] = [];
    const chunkSize = BigInt(1_000);

    // Process chunks sequentially to avoid RPC rate limiting
    for (
      let start = fromBlock;
      start <= currentBlock;
      start += chunkSize + BigInt(1)
    ) {
      const end =
        start + chunkSize > currentBlock ? currentBlock : start + chunkSize;
      const fromHex = `0x${start.toString(16)}` as const;
      const toHex = `0x${end.toString(16)}` as const;

      // 4 parallel calls per chunk is fine
      const [depositLogs, withdrawalLogs, enterLogs, resolveLogs] =
        await Promise.all([
          publicClient.getLogs({
            address: ESCROW_ADDRESS,
            event: DEPOSIT_EVENT,
            args: { traderId: tokenId },
            fromBlock: start,
            toBlock: end,
          }),
          publicClient.getLogs({
            address: ESCROW_ADDRESS,
            event: WITHDRAWAL_EVENT,
            args: { traderId: tokenId },
            fromBlock: start,
            toBlock: end,
          }),
          publicClient.request({
            method: "eth_getLogs",
            params: [
              {
                address: ESCROW_ADDRESS,
                fromBlock: fromHex,
                toBlock: toHex,
                topics: [DEAL_ENTERED_TOPIC, null, traderIdTopic],
              },
            ],
          }),
          publicClient.request({
            method: "eth_getLogs",
            params: [
              {
                address: ESCROW_ADDRESS,
                fromBlock: fromHex,
                toBlock: toHex,
                topics: [ENTRY_RESOLVED_TOPIC, null, traderIdTopic],
              },
            ],
          }),
        ]);

      for (const log of depositLogs) {
        events.push({
          type: "deposit",
          block: Number(log.blockNumber),
          txHash: log.transactionHash,
          amount: Number(log.args.amount ?? 0) / 1_000_000,
        });
      }

      for (const log of withdrawalLogs) {
        events.push({
          type: "withdrawal",
          block: Number(log.blockNumber),
          txHash: log.transactionHash,
          amount: Number(log.args.amount ?? 0) / 1_000_000,
        });
      }

      for (const log of enterLogs) {
        const decoded = decodeRawLog(log);
        const args = decoded.args as { dealId: bigint; traderId: bigint };
        events.push({
          type: "enter",
          block: Number(BigInt(log.blockNumber ?? "0")),
          txHash: log.transactionHash ?? "",
          dealId: Number(args.dealId),
        });
      }

      for (const log of resolveLogs) {
        const decoded = decodeRawLog(log);
        const args = decoded.args as {
          dealId: bigint;
          traderId: bigint;
          pnl: bigint;
          rake: bigint;
        };
        events.push({
          type: "resolve",
          block: Number(BigInt(log.blockNumber ?? "0")),
          txHash: log.transactionHash ?? "",
          dealId: Number(args.dealId),
          pnl: Number(args.pnl) / 1_000_000,
          rake: Number(args.rake) / 1_000_000,
        });
      }
    }

    // Sort descending (most recent first) so client can render directly
    events.sort((a, b) => b.block - a.block);

    return NextResponse.json({ events });
  } catch (e) {
    console.error("Trader history error:", e);
    const message = e instanceof Error ? e.message : "Failed to fetch history";
    const status =
      message === "You do not own this trader"
        ? 403
        : message.includes("contains 0 rows")
          ? 404
          : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
