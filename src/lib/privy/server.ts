import { PrivyClient } from "@privy-io/server-auth";
import { NextRequest } from "next/server";

const privyClient = new PrivyClient(
  process.env.NEXT_PUBLIC_PRIVY_APP_ID!,
  process.env.PRIVY_APP_SECRET!
);

export async function verifyPrivyToken(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    throw new Error("Missing or invalid Authorization header");
  }

  const token = authHeader.slice(7);
  const claims = await privyClient.verifyAuthToken(token);
  const user = await privyClient.getUser(claims.userId);

  return { claims, user };
}

type PrivyWalletAccount = { type: string; address?: string };
type PrivyLikeUser = {
  wallet?: { address?: string | null } | null;
  linkedAccounts?: PrivyWalletAccount[] | null;
};

/**
 * Extract the canonical wallet address from a Privy user payload.
 */
export function getPrivyWalletAddress(user: PrivyLikeUser): string | null {
  const linkedWallet = user.linkedAccounts?.find(
    (account) => account.type === "wallet" && typeof account.address === "string"
  );
  const walletAddress = user.wallet?.address ?? linkedWallet?.address ?? null;
  return walletAddress;
}
