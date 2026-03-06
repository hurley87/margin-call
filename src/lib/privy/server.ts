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
