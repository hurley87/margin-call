import { NextRequest, NextResponse } from "next/server";
import { verifyPrivyToken } from "@/lib/privy/server";
import { createServerClient } from "@/lib/supabase/client";
import { createDeal } from "@/lib/supabase/queries";
import { DEAL_CREATION_FEE_PERCENTAGE } from "@/lib/constants";

export async function POST(request: NextRequest) {
  try {
    const { user } = await verifyPrivyToken(request);

    const walletAddress = user.wallet?.address;
    if (!walletAddress) {
      return NextResponse.json(
        { error: "No wallet linked to this account" },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { prompt, pot_amount, entry_cost } = body as {
      prompt?: string;
      pot_amount?: number;
      entry_cost?: number;
    };

    if (!prompt || typeof prompt !== "string" || prompt.trim().length === 0) {
      return NextResponse.json(
        { error: "prompt is required" },
        { status: 400 }
      );
    }

    if (!pot_amount || typeof pot_amount !== "number" || pot_amount <= 0) {
      return NextResponse.json(
        { error: "pot_amount must be a positive number" },
        { status: 400 }
      );
    }

    if (!entry_cost || typeof entry_cost !== "number" || entry_cost <= 0) {
      return NextResponse.json(
        { error: "entry_cost must be a positive number" },
        { status: 400 }
      );
    }

    // Look up desk manager by wallet address
    const supabase = createServerClient();
    const { data: deskManager, error: dmError } = await supabase
      .from("desk_managers")
      .select("id")
      .eq("wallet_address", walletAddress)
      .single();

    if (dmError || !deskManager) {
      return NextResponse.json(
        { error: "Desk manager not found. Register first." },
        { status: 404 }
      );
    }

    // Deduct 5% creation fee from the pot
    const feeAmount = pot_amount * (DEAL_CREATION_FEE_PERCENTAGE / 100);
    const netPot = pot_amount - feeAmount;

    const deal = await createDeal({
      creator_id: deskManager.id,
      creator_type: "desk_manager",
      prompt: prompt.trim(),
      pot_usdc: netPot,
      entry_cost_usdc: entry_cost,
    });

    return NextResponse.json({ deal, fee: feeAmount });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 401 });
  }
}
