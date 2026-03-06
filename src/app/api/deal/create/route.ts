import { NextRequest, NextResponse } from "next/server";
import { verifyPrivyToken } from "@/lib/privy/server";
import { createServerClient } from "@/lib/supabase/client";
import { createDeal } from "@/lib/supabase/queries";
import { withPayment } from "@/lib/x402/middleware";
import {
  DEAL_CREATION_FEE_PERCENTAGE,
  MIN_POT_AMOUNT,
  MIN_ENTRY_COST,
} from "@/lib/constants";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handler(request: NextRequest): Promise<NextResponse<any>> {
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

    if (
      !pot_amount ||
      typeof pot_amount !== "number" ||
      pot_amount < MIN_POT_AMOUNT
    ) {
      return NextResponse.json(
        { error: `pot_amount must be at least ${MIN_POT_AMOUNT} USDC` },
        { status: 400 }
      );
    }

    if (
      !entry_cost ||
      typeof entry_cost !== "number" ||
      entry_cost < MIN_ENTRY_COST
    ) {
      return NextResponse.json(
        { error: `entry_cost must be at least ${MIN_ENTRY_COST} USDC` },
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

// x402: require USDC payment to create a deal
// Note: The price here is a placeholder — in production, the client sends
// the pot_amount as the x402 payment. The route validates the body matches.
export const POST = withPayment(
  handler,
  "$20.00",
  "Create a deal on Margin Call"
);
