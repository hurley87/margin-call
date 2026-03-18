import { createServerClient } from "./client";

export interface CreateDealParams {
  creator_id: string;
  creator_type: "desk_manager" | "agent";
  prompt: string;
  pot_usdc: number;
  entry_cost_usdc: number;
  max_extraction_percentage?: number;
  on_chain_deal_id?: number;
  fee_usdc?: number;
  on_chain_tx_hash?: string;
}

export async function createDeal(params: CreateDealParams) {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("deals")
    .insert({
      creator_id: params.creator_id,
      creator_type: params.creator_type,
      prompt: params.prompt,
      pot_usdc: params.pot_usdc,
      entry_cost_usdc: params.entry_cost_usdc,
      max_extraction_percentage: params.max_extraction_percentage ?? 25,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function getDeal(id: string) {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("deals")
    .select()
    .eq("id", id)
    .single();

  if (error) throw error;
  return data;
}

export async function listOpenDeals() {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("deals")
    .select()
    .eq("status", "open")
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data;
}

/**
 * Return open deals created by the given wallet (creator_address).
 * creatorAddress is normalized to lowercase for consistent comparison.
 */
export async function listOpenDealsByCreator(creatorAddress: string) {
  const supabase = createServerClient();
  const normalized = creatorAddress.toLowerCase();
  const { data, error } = await supabase
    .from("deals")
    .select()
    .eq("status", "open")
    .eq("creator_address", normalized)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data;
}

export interface CreateDealOutcomeParams {
  deal_id: string;
  trader_id: string;
  narrative: string;
  trader_pnl_usdc: number;
  pot_change_usdc: number;
  rake_usdc: number;
  assets_gained: { name: string; value_usdc: number }[];
  assets_lost: string[];
  trader_wiped_out: boolean;
  wipeout_reason?: string;
  on_chain_tx_hash?: string;
}

export async function createDealOutcome(params: CreateDealOutcomeParams) {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("deal_outcomes")
    .insert(params)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function listDealOutcomes(dealId: string) {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("deal_outcomes")
    .select()
    .eq("deal_id", dealId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data;
}

/**
 * Return an existing outcome for this deal + trader if any (for idempotency).
 */
export async function getExistingDealOutcome(
  dealId: string,
  traderId: string
): Promise<{ id: string; [key: string]: unknown } | null> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("deal_outcomes")
    .select()
    .eq("deal_id", dealId)
    .eq("trader_id", traderId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data as { id: string; [key: string]: unknown } | null;
}

export async function getActiveSystemPrompt(name: string): Promise<string> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("system_prompts")
    .select("content")
    .eq("name", name)
    .eq("is_active", true)
    .single();

  if (error || !data) {
    throw new Error(`System prompt "${name}" not found or inactive`);
  }
  return data.content;
}

export async function listTraderOutcomes(traderId: string, limit = 20) {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("deal_outcomes")
    .select()
    .eq("trader_id", traderId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data;
}

export async function listTraderActivity(traderId: string, limit = 50) {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("agent_activity_log")
    .select()
    .eq("trader_id", traderId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data;
}

export async function listActivityFeed(traderIds: string[], limit = 100) {
  if (traderIds.length === 0) return [];
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("agent_activity_log")
    .select()
    .in("trader_id", traderIds)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data;
}

export interface Asset {
  id: string;
  trader_id: string;
  name: string;
  value_usdc: number;
  source_deal_id: string | null;
  source_outcome_id: string | null;
  acquired_at: string;
}

export async function getTraderAssets(traderId: string): Promise<Asset[]> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("assets")
    .select()
    .eq("trader_id", traderId)
    .order("acquired_at", { ascending: false });

  if (error) throw error;
  return data ?? [];
}

export async function syncAssetsFromOutcome(
  traderId: string,
  dealId: string,
  outcomeId: string,
  assetsGained: { name: string; value_usdc: number }[],
  assetsLost: string[]
) {
  const supabase = createServerClient();

  // Add gained assets
  if (assetsGained.length > 0) {
    const rows = assetsGained.map((a) => ({
      trader_id: traderId,
      name: a.name,
      value_usdc: a.value_usdc,
      source_deal_id: dealId,
      source_outcome_id: outcomeId,
    }));
    const { error } = await supabase.from("assets").insert(rows);
    if (error) throw error;
  }

  // Remove lost assets (by name, oldest first) — batch fetch then batch delete
  if (assetsLost.length > 0) {
    const { data: candidates } = await supabase
      .from("assets")
      .select("id, name")
      .eq("trader_id", traderId)
      .in("name", assetsLost)
      .order("acquired_at", { ascending: true });

    if (candidates && candidates.length > 0) {
      // Pick one asset per lost name (oldest first)
      const seen = new Set<string>();
      const toDelete: string[] = [];
      for (const c of candidates) {
        if (!seen.has(c.name)) {
          seen.add(c.name);
          toDelete.push(c.id);
        }
      }
      if (toDelete.length > 0) {
        await supabase.from("assets").delete().in("id", toDelete);
      }
    }
  }
}

export async function clearTraderAssets(traderId: string) {
  const supabase = createServerClient();
  const { error } = await supabase
    .from("assets")
    .delete()
    .eq("trader_id", traderId);
  if (error) throw error;
}

// --- Market Wire / Narrative queries ---

export async function getLatestNarrative() {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("market_narratives")
    .select()
    .order("epoch", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function getNarrativeHistory(limit = 10) {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("market_narratives")
    .select()
    .order("epoch", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data ?? [];
}

export interface CreateNarrativeParams {
  epoch: number;
  headlines: { headline: string; body: string; category: string }[];
  world_state: Record<string, unknown>;
  raw_narrative: string;
  events_ingested: unknown[];
}

export async function createNarrative(params: CreateNarrativeParams) {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("market_narratives")
    .insert(params)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function getRecentGameEvents(since: Date) {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("deal_outcomes")
    .select("trader_pnl_usdc, trader_wiped_out, trader_id, deal_id, created_at")
    .or(`trader_wiped_out.eq.true,trader_pnl_usdc.gt.10,trader_pnl_usdc.lt.-10`)
    .gte("created_at", since.toISOString())
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) throw error;
  if (!data || data.length === 0) return [];

  // Fetch trader names and deal prompts
  const traderIds = [...new Set(data.map((d) => d.trader_id))];
  const dealIds = [...new Set(data.map((d) => d.deal_id))];

  const [traderResult, dealResult] = await Promise.all([
    supabase.from("traders").select("id, name").in("id", traderIds),
    supabase.from("deals").select("id, prompt").in("id", dealIds),
  ]);

  if (traderResult.error) throw traderResult.error;
  if (dealResult.error) throw dealResult.error;

  const traderMap = new Map(
    (traderResult.data ?? []).map((t) => [t.id, t.name || "Unknown Trader"])
  );
  const dealMap = new Map((dealResult.data ?? []).map((d) => [d.id, d.prompt]));

  return data.map((outcome) => ({
    trader_name: traderMap.get(outcome.trader_id) ?? "Unknown Trader",
    deal_prompt: dealMap.get(outcome.deal_id) ?? "Unknown Deal",
    trader_pnl_usdc: Number(outcome.trader_pnl_usdc),
    trader_wiped_out: outcome.trader_wiped_out,
  }));
}

// --- Trader Transactions ---

export interface CreateTraderTransactionParams {
  trader_id: string;
  type: "deposit" | "withdrawal" | "enter" | "resolve";
  tx_hash: string;
  block_number?: number;
  amount_usdc?: number;
  deal_id?: string;
  on_chain_deal_id?: number;
  pnl_usdc?: number;
  rake_usdc?: number;
}

export async function createTraderTransaction(
  params: CreateTraderTransactionParams
) {
  const supabase = createServerClient();
  const { error } = await supabase
    .from("trader_transactions")
    .upsert(params, {
      onConflict: "trader_id,tx_hash,type",
      ignoreDuplicates: true,
    });

  if (error) {
    console.error("Failed to insert trader transaction:", error);
  }
}

export async function listTraderTransactions(traderId: string, limit = 50) {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("trader_transactions")
    .select()
    .eq("trader_id", traderId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data;
}

export async function updateDealAfterEntry(
  dealId: string,
  potChange: number,
  wipeout: boolean
) {
  const supabase = createServerClient();
  const { error } = await supabase.rpc("update_deal_after_entry", {
    p_deal_id: dealId,
    p_pot_change: potChange,
    p_wipeout: wipeout,
  });

  if (error) {
    // Fallback: manual update if RPC not available
    const deal = await getDeal(dealId);
    const { error: updateError } = await supabase
      .from("deals")
      .update({
        pot_usdc: deal.pot_usdc + potChange,
        entry_count: deal.entry_count + 1,
        wipeout_count: deal.wipeout_count + (wipeout ? 1 : 0),
      })
      .eq("id", dealId);
    if (updateError) throw updateError;
  }
}
