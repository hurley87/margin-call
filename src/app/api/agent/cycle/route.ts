import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { runCycle } from "@/lib/agent/cycle";
import { logActivity } from "@/lib/agent/activity";
import { verifyAgentSecret, getBaseUrl } from "@/lib/agent/auth";
import { createServerClient } from "@/lib/supabase/client";
import { AGENT_LOOP_INTERVAL_MS } from "@/lib/constants";

/**
 * POST /api/agent/cycle
 *
 * Runs one iteration of the autonomous trade cycle for a trader.
 * If the trader is still active after the cycle, schedules the next
 * iteration after AGENT_LOOP_INTERVAL_MS (30s) using next/server's after().
 *
 * Zombie loop prevention: stamps `last_cycle_at` before running and checks
 * that no other cycle has started since when scheduling the next iteration.
 */
export async function POST(request: NextRequest) {
  try {
    if (!verifyAgentSecret(request)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { trader_id } = body as { trader_id?: string };

    if (!trader_id) {
      return NextResponse.json(
        { error: "trader_id is required" },
        { status: 400 }
      );
    }

    // Stamp cycle start time for deduplication
    const cycleStartedAt = new Date().toISOString();
    const supabase = createServerClient();
    await supabase
      .from("traders")
      .update({ last_cycle_at: cycleStartedAt })
      .eq("id", trader_id);

    const baseUrl = getBaseUrl(request);
    const result = await runCycle(trader_id, baseUrl);

    // Schedule next cycle only if trader should keep trading
    const shouldContinue =
      result.status === "entered" ||
      result.status === "no_deals" ||
      result.status === "skipped_all";

    if (shouldContinue) {
      after(async () => {
        await new Promise((resolve) =>
          setTimeout(resolve, AGENT_LOOP_INTERVAL_MS)
        );

        // Zombie guard: only continue if no newer cycle has started
        const { data: trader } = await supabase
          .from("traders")
          .select("last_cycle_at, status")
          .eq("id", trader_id)
          .single();

        if (
          !trader ||
          trader.status !== "active" ||
          trader.last_cycle_at !== cycleStartedAt
        ) {
          return; // Another cycle took over, or trader was paused/wiped
        }

        try {
          await fetch(`${baseUrl}/api/agent/cycle`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-agent-secret": process.env.AGENT_CYCLE_SECRET ?? "",
            },
            body: JSON.stringify({ trader_id }),
          });
        } catch (err) {
          console.error("Failed to schedule next cycle:", err);
          await logActivity(
            trader_id,
            "error",
            `Failed to schedule next cycle: ${err instanceof Error ? err.message : "unknown"}`
          );
        }
      });
    }

    return NextResponse.json({
      ...result,
      next_cycle: shouldContinue,
    });
  } catch (e) {
    console.error("Agent cycle error:", e);
    const message = e instanceof Error ? e.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
