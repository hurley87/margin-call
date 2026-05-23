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

/**
 * Returns the canonical `did:privy:*` subject for a verified Privy auth token.
 * Prefers `user.id` (already DID-prefixed by Privy), falls back to `claims.userId`,
 * prefixing if needed.
 */
export function canonicalPrivySubject(
  claimsUserId: string,
  userId?: string
): string {
  if (typeof userId === "string" && userId.startsWith("did:privy:")) {
    return userId;
  }
  if (claimsUserId.startsWith("did:privy:")) {
    return claimsUserId;
  }
  return `did:privy:${claimsUserId}`;
}
