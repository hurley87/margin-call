import { NextRequest, NextResponse } from "next/server";
import { createConvexAdminClient } from "@/lib/convex/server-client";
import { verifyPrivyToken } from "@/lib/privy/server";
import { internal } from "../../../../../../convex/_generated/api";
import type { Id } from "../../../../../../convex/_generated/dataModel";
import { setDepositorOnChain } from "@/lib/cdp/trader-wallet";
import { makePublicClient } from "@/lib/contracts/client";
import { ESCROW_ADDRESS, escrowAbi } from "@/lib/contracts/escrow";

function privySubjectCandidates(claimsUserId: string, userId?: string) {
  return new Set(
    [claimsUserId, `did:privy:${claimsUserId}`, userId].filter(
      (value): value is string => typeof value === "string" && value.length > 0
    )
  );
}

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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const trader = (await convex.query(internal.traders.loadInternal as any, {
    traderId: id as Id<"traders">,
  })) as {
    ownerSubject: string;
    deskManagerId: Id<"deskManagers">;
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

  if (trader.walletStatus !== "ready" || !trader.tokenId) {
    return NextResponse.json(
      { error: "Trader wallet not ready" },
      { status: 400 }
    );
  }

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
