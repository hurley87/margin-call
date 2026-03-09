import { createServerClient } from "@/lib/supabase/client";

export type ActivityType =
  | "cycle_start"
  | "scan"
  | "evaluate"
  | "skip"
  | "enter"
  | "win"
  | "loss"
  | "wipeout"
  | "pause"
  | "resume"
  | "revive"
  | "error"
  | "cycle_end";

interface ActivityEntry {
  trader_id: string;
  activity_type: ActivityType;
  message: string;
  deal_id?: string | null;
  metadata?: Record<string, unknown>;
}

const supabase = createServerClient();

export async function logActivity(
  traderId: string,
  activityType: ActivityType,
  message: string,
  dealId?: string,
  metadata?: Record<string, unknown>
) {
  const { error } = await supabase.from("agent_activity_log").insert({
    trader_id: traderId,
    activity_type: activityType,
    message,
    deal_id: dealId ?? null,
    metadata: metadata ?? {},
  });

  if (error) {
    console.error("Failed to log activity:", error);
  }
}

/** Batch-insert multiple activity entries in a single query. */
export async function logActivities(entries: ActivityEntry[]) {
  if (entries.length === 0) return;

  const { error } = await supabase.from("agent_activity_log").insert(
    entries.map((e) => ({
      trader_id: e.trader_id,
      activity_type: e.activity_type,
      message: e.message,
      deal_id: e.deal_id ?? null,
      metadata: e.metadata ?? {},
    }))
  );

  if (error) {
    console.error("Failed to batch log activities:", error);
  }
}
