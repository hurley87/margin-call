import { NextRequest, NextResponse } from "next/server";
import { erc20Abi } from "viem";
import { createConvexAdminClient } from "@/lib/convex/server-client";
import { makePublicClient } from "@/lib/contracts/client";
import { USDC_SEPOLIA_ADDRESS } from "@/lib/contracts/escrow";
import { usdcFromRaw } from "@/lib/contracts/balance";
import { verifyPrivyToken, canonicalPrivySubject } from "@/lib/privy/server";
import { getEmbeddedEvmWalletAddress } from "@/lib/privy/wallet";
import { normalizeEmail } from "@/lib/email";
import { internal } from "../../../../../convex/_generated/api";

// Persists the embedded wallet's USDC balance to Convex so server-side
// hire/deal gates do not trust browser state alone.
export async function POST(request: NextRequest) {
  let auth;
  try {
    auth = await verifyPrivyToken(request);
  } catch {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }

  const walletAddress = getEmbeddedEvmWalletAddress(auth.user);
  if (!walletAddress) {
    return NextResponse.json(
      { error: "Embedded wallet not found" },
      { status: 400 }
    );
  }

  const publicClient = makePublicClient();
  const raw = await publicClient.readContract({
    address: USDC_SEPOLIA_ADDRESS,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [walletAddress],
  });
  const balanceUsdc = usdcFromRaw(raw);

  const convex = createConvexAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await convex.mutation(internal.deskManagers.syncWalletBalance as any, {
    subject: canonicalPrivySubject(auth.claims.userId, auth.user.id),
    walletAddress,
    balanceUsdc,
    email: normalizeEmail(auth.user.email?.address),
  });

  return NextResponse.json({ ok: true, balanceUsdc });
}
