import { NextRequest, NextResponse } from "next/server";
import { runCycle } from "@/lib/agent/cycle";
import { getBaseUrl } from "@/lib/agent/auth";
import { verifySIWARequest } from "@/lib/siwa/verify";
import { siwaAuthMatchesTrader } from "@/lib/siwa/binding";
import { createServerClient } from "@/lib/supabase/client";
import { getTrader } from "@/lib/supabase/traders";
import { agentCycleLimit, checkRateLimit } from "@/lib/rate-limit";

/**
 * POST /api/agent/cycle
 *
 * Runs one iteration of the autonomous trade loop for a trader.
 * Continuation is driven by Vercel Cron → POST /api/agent/scheduler (not self-POST + after()).
 */
export async function POST(request: NextRequest) {
  try {
    // Verify SIWA (Sign In With Agent) authentication
    const siwaMessageB64 = request.headers.get("x-siwa-message");
    const siwaSignature = request.headers.get("x-siwa-signature");
    if (!siwaMessageB64 || !siwaSignature) {
      return NextResponse.json(
        { error: "Missing SIWA auth headers" },
        { status: 401 }
      );
    }
    const siwaMessage = Buffer.from(siwaMessageB64, "base64").toString("utf-8");
    const siwaResult = await verifySIWARequest(siwaMessage, siwaSignature);
    if (!siwaResult.valid) {
      return NextResponse.json({ error: "Invalid SIWA auth" }, { status: 401 });
    }

    const body = await request.json();
    const { trader_id } = body as { trader_id?: string };

    if (!trader_id) {
      return NextResponse.json(
        { error: "trader_id is required" },
        { status: 400 }
      );
    }

    const trader = await getTrader(trader_id);
    if (!siwaAuthMatchesTrader(siwaResult, trader)) {
      return NextResponse.json(
        { error: "SIWA identity does not match trader" },
        { status: 403 }
      );
    }

    // Rate limit: 1 request per 30s per trader
    const limited = await checkRateLimit(
      agentCycleLimit,
      `trader:${trader_id}`
    );
    if (limited) return limited;

    // Stamp cycle start time (scheduler uses this to avoid hot-looping)
    const cycleStartedAt = new Date().toISOString();
    const supabase = createServerClient();
    await supabase
      .from("traders")
      .update({ last_cycle_at: cycleStartedAt })
      .eq("id", trader_id);

    const baseUrl = getBaseUrl(request);
    const result = await runCycle(trader_id, baseUrl);

    // next_cycle is always false — continuation is handled by /api/agent/scheduler cron
    return NextResponse.json({ ...result, next_cycle: false });
  } catch (e) {
    console.error("Agent cycle error:", e);
    const message = e instanceof Error ? e.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
