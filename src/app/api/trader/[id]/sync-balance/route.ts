import { NextRequest, NextResponse } from "next/server";
import { createConvexAdminClient } from "@/lib/convex/server-client";
import { verifyPrivyToken } from "@/lib/privy/server";
import { makePublicClient } from "@/lib/contracts/client";
import { ESCROW_ADDRESS, escrowAbi } from "@/lib/contracts/escrow";
import { internal } from "../../../../../../convex/_generated/api";
import type { Id } from "../../../../../../convex/_generated/dataModel";

const USDC_DECIMALS = 1_000_000;

function privySubjectCandidates(claimsUserId: string, userId?: string) {
  return new Set(
    [claimsUserId, `did:privy:${claimsUserId}`, userId].filter(
      (value): value is string => typeof value === "string" && value.length > 0
    )
  );
}

/**
 * POST /api/trader/[id]/sync-balance
 *
 * Reads the confirmed on-chain escrow balance for an owned trader and syncs it
 * into Convex. Used after deposit/withdraw receipts so activation and cycle
 * eligibility use the durable funded state instead of a browser-only read.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let auth;
  try {
    auth = await verifyPrivyToken(request);
  } catch {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }

  const { id } = await params;
  const convex = createConvexAdminClient();

  // ConvexHttpClient typings only cover public functions; admin auth allows internal.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const trader = (await convex.query(internal.traders.loadInternal as any, {
    traderId: id as Id<"traders">,
  })) as {
    ownerSubject: string;
    walletStatus: string;
    tokenId?: number;
  } | null;

  if (!trader) {
    return NextResponse.json({ error: "Trader not found" }, { status: 404 });
  }

  const subjects = privySubjectCandidates(auth.claims.userId, auth.user.id);
  if (!subjects.has(trader.ownerSubject)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (trader.walletStatus !== "ready" || trader.tokenId === undefined) {
    return NextResponse.json(
      { error: "Trader wallet not ready" },
      { status: 400 }
    );
  }

  const publicClient = makePublicClient();
  const raw = await publicClient.readContract({
    address: ESCROW_ADDRESS,
    abi: escrowAbi,
    functionName: "getBalance",
    args: [BigInt(trader.tokenId)],
  });
  const balanceUsdc = Number(raw) / USDC_DECIMALS;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await convex.mutation(internal.traders.syncEscrowBalance as any, {
    traderId: id as Id<"traders">,
    balanceUsdc,
  });

  return NextResponse.json({ ok: true, balanceUsdc });
}
