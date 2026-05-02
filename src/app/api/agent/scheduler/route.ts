import { NextRequest, NextResponse } from "next/server";
import { getBaseUrl } from "@/lib/agent/auth";
import { postSignedAgentCycle } from "@/lib/agent/trigger-signed-cycle";
import { listActiveTraderIdsStaleForCron } from "@/lib/supabase/queries";
import { AGENT_CRON_STALE_MS } from "@/lib/constants";

/**
 * POST /api/agent/scheduler
 *
 * LEGACY — guarded by LEGACY_AGENT_LOOP=1 env flag (issue #85).
 * The Convex cron + internal.agent.scheduler action is now the canonical path.
 * This route is kept to avoid breaking existing Vercel Cron config until the
 * full removal tracked in issue #91.
 *
 * To re-enable: set LEGACY_AGENT_LOOP=1 in your environment.
 * Default: disabled (returns 503).
 */
export async function POST(request: NextRequest) {
  if (process.env.LEGACY_AGENT_LOOP !== "1") {
    return NextResponse.json(
      {
        error:
          "Legacy agent loop is disabled. Set LEGACY_AGENT_LOOP=1 to re-enable. " +
          "The Convex-native cron (convex/crons.ts) is now the active scheduler.",
      },
      { status: 503 }
    );
  }
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json(
      { error: "CRON_SECRET not configured" },
      { status: 500 }
    );
  }
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const staleBefore = new Date(Date.now() - AGENT_CRON_STALE_MS);
  const traderIds = await listActiveTraderIdsStaleForCron(staleBefore).catch(
    (e: unknown) => {
      console.error("scheduler listActiveTraderIdsStaleForCron:", e);
      return null;
    }
  );

  if (!traderIds) {
    return NextResponse.json({ error: "Query failed" }, { status: 500 });
  }

  const baseUrl = getBaseUrl(request);

  const settled = await Promise.allSettled(
    traderIds.map(async (traderId) => {
      const res = await postSignedAgentCycle(traderId, baseUrl);
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        console.warn(
          `scheduler cycle failed for ${traderId}: ${res.status}`,
          body.slice(0, 200)
        );
      }
      return { trader_id: traderId, ok: res.ok, status: res.status };
    })
  );

  const results = settled.map((s, i) => {
    if (s.status === "fulfilled") return s.value;
    console.error(`scheduler cycle error for ${traderIds[i]}:`, s.reason);
    return { trader_id: traderIds[i]!, ok: false } as const;
  });

  return NextResponse.json({
    kicked: traderIds.length,
    results,
  });
}
