import { NextRequest, NextResponse } from "next/server";
import { makePublicClient } from "@/lib/contracts/client";
import { ESCROW_ADDRESS, escrowAbi } from "@/lib/contracts/escrow";
import { createServerClient } from "@/lib/supabase/client";
export async function POST(request: NextRequest) {
  const secret = request.headers.get("x-operator-secret");
  if (secret !== process.env.OPERATOR_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const supabase = createServerClient();
    const publicClient = makePublicClient();

    const { data: traders, error } = await supabase
      .from("traders")
      .select("id, token_id, name")
      .not("token_id", "is", null);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!traders || traders.length === 0) {
      return NextResponse.json({ synced: 0, total: 0 });
    }

    // Fetch all balances concurrently
    const balances = await Promise.all(
      traders.map(async (trader) => {
        try {
          const raw = await publicClient.readContract({
            address: ESCROW_ADDRESS,
            abi: escrowAbi,
            functionName: "getBalance",
            args: [BigInt(trader.token_id)],
          });
          return { id: trader.id, balance_usdc: Number(raw) / 1_000_000 };
        } catch (e) {
          console.error(`Failed to fetch balance for trader ${trader.id}:`, e);
          return null;
        }
      })
    );

    // Write all updates concurrently
    const results = await Promise.all(
      balances
        .filter((b): b is NonNullable<typeof b> => b !== null)
        .map(async ({ id, balance_usdc }) => {
          const { error: updateError } = await supabase
            .from("traders")
            .update({ escrow_balance_usdc: balance_usdc })
            .eq("id", id);
          if (updateError) {
            console.error(`Failed to update trader ${id}:`, updateError);
            return false;
          }
          return true;
        })
    );

    const synced = results.filter(Boolean).length;
    return NextResponse.json({ synced, total: traders.length });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Sync failed";
    console.error("Balance sync error:", e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
