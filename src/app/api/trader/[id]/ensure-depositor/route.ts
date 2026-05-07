import { NextRequest, NextResponse } from "next/server";
import { createConvexAdminClient } from "@/lib/convex/server-client";
import { internal } from "../../../../../../convex/_generated/api";
import type { Id } from "../../../../../../convex/_generated/dataModel";
import { setDepositorOnChain } from "@/lib/cdp/trader-wallet";
import { makePublicClient } from "@/lib/contracts/client";
import { ESCROW_ADDRESS, escrowAbi } from "@/lib/contracts/escrow";

/**
 * POST /api/trader/[id]/ensure-depositor
 *
 * Idempotently registers the desk manager's wallet as the authorized depositor
 * for this trader on the MarginCallEscrow contract. Must be called before the
 * first depositFor() — the contract reverts if no depositor is registered.
 *
 * Safe to call multiple times: skips the on-chain write if depositor already matches.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const convex = createConvexAdminClient();

  // Load trader (internal query bypasses auth)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const trader = (await convex.query(internal.traders.loadInternal as any, {
    traderId: id as Id<"traders">,
  })) as {
    deskManagerId: Id<"deskManagers">;
    walletStatus: string;
    tokenId?: number;
  } | null;

  if (!trader) {
    return NextResponse.json({ error: "Trader not found" }, { status: 404 });
  }
  if (trader.walletStatus !== "ready" || !trader.tokenId) {
    return NextResponse.json(
      { error: "Trader wallet not ready" },
      { status: 400 }
    );
  }

  // Load desk manager to get the depositor address
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dm = (await convex.query(internal.deskManagers.getByIdInternal as any, {
    id: trader.deskManagerId,
  })) as { walletAddress?: string } | null;

  const depositorAddress = dm?.walletAddress;
  if (!depositorAddress) {
    return NextResponse.json(
      { error: "Owner wallet address not on file" },
      { status: 400 }
    );
  }

  // Check current depositor — skip write if already correct (idempotency)
  const publicClient = makePublicClient();
  const currentDepositor = (await publicClient.readContract({
    address: ESCROW_ADDRESS,
    abi: escrowAbi,
    functionName: "depositors",
    args: [BigInt(trader.tokenId)],
  })) as string;

  if (currentDepositor.toLowerCase() === depositorAddress.toLowerCase()) {
    return NextResponse.json({ ok: true, alreadySet: true });
  }

  await setDepositorOnChain(trader.tokenId, depositorAddress);

  return NextResponse.json({ ok: true });
}
