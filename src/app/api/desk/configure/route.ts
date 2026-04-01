import { NextRequest, NextResponse } from "next/server";
import { verifyPrivyToken } from "@/lib/privy/server";
import { createServerClient } from "@/lib/supabase/client";
import { getOwnedTrader } from "@/lib/supabase/traders";
import type { Mandate } from "@/lib/agent/evaluator";
import type { Json } from "@/lib/supabase/database.types";

const MANDATE_KEYS: (keyof Mandate)[] = [
  "max_entry_cost_usdc",
  "min_pot_usdc",
  "max_pot_usdc",
  "bankroll_pct",
  "keywords",
  "approval_threshold_usdc",
  "llm_deal_selection",
];

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
    const { trader_id, mandate, personality } = body;

    if (!trader_id || !mandate || typeof mandate !== "object") {
      return NextResponse.json(
        { error: "trader_id and mandate are required" },
        { status: 400 }
      );
    }

    if (personality != null && typeof personality !== "string") {
      return NextResponse.json(
        { error: "personality must be a string or null" },
        { status: 400 }
      );
    }
    if (typeof personality === "string" && personality.length > 2000) {
      return NextResponse.json(
        { error: "personality must be at most 2000 characters" },
        { status: 400 }
      );
    }

    // Verify ownership
    await getOwnedTrader(trader_id, walletAddress);

    // Validate mandate fields
    const cleaned: Record<string, Json> = {};
    for (const key of MANDATE_KEYS) {
      if (key in mandate) {
        const val = mandate[key];
        if (key === "keywords") {
          if (
            !Array.isArray(val) ||
            !val.every((v: unknown) => typeof v === "string")
          ) {
            return NextResponse.json(
              { error: "keywords must be an array of strings" },
              { status: 400 }
            );
          }
          cleaned[key] = val;
        } else if (key === "bankroll_pct") {
          const num = Number(val);
          if (isNaN(num) || num <= 0 || num > 100) {
            return NextResponse.json(
              { error: "bankroll_pct must be between 1 and 100" },
              { status: 400 }
            );
          }
          cleaned[key] = num;
        } else if (key === "llm_deal_selection") {
          if (typeof val !== "boolean") {
            return NextResponse.json(
              { error: "llm_deal_selection must be a boolean" },
              { status: 400 }
            );
          }
          cleaned[key] = val;
        } else {
          // Numeric fields — allow null to clear
          if (val === null || val === undefined) continue;
          const num = Number(val);
          if (isNaN(num) || num < 0) {
            return NextResponse.json(
              { error: `${key} must be a non-negative number` },
              { status: 400 }
            );
          }
          cleaned[key] = num;
        }
      }
    }

    const supabase = createServerClient();
    const updatePayload: Record<string, unknown> = { mandate: cleaned };
    if (personality !== undefined) {
      updatePayload.personality = personality?.trim() || null;
    }

    const { data: updated, error: updateError } = await supabase
      .from("traders")
      .update(updatePayload)
      .eq("id", trader_id)
      .select()
      .single();

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({
      message: "Mandate updated",
      trader: updated,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unauthorized";
    const status = message === "You do not own this trader" ? 403 : 401;
    return NextResponse.json({ error: message }, { status });
  }
}
