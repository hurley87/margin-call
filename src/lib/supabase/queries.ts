import { createServerClient } from "./client";
import type { Json } from "./database.types";

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
      ...(params.on_chain_deal_id != null && {
        on_chain_deal_id: params.on_chain_deal_id,
      }),
      ...(params.fee_usdc != null && { fee_usdc: params.fee_usdc }),
      ...(params.on_chain_tx_hash && {
        on_chain_tx_hash: params.on_chain_tx_hash,
      }),
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
  narrative: Json;
  trader_pnl_usdc: number;
  pot_change_usdc: number;
  rake_usdc: number;
  assets_gained: Json;
  assets_lost: Json;
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

/**
 * Return deal ids that already have an outcome for this trader.
 */
export async function getResolvedDealIdsForTrader(
  traderId: string,
  dealIds: string[]
): Promise<Set<string>> {
  if (dealIds.length === 0) {
    return new Set();
  }

  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("deal_outcomes")
    .select("deal_id")
    .eq("trader_id", traderId)
    .in("deal_id", dealIds);

  if (error) throw error;

  return new Set((data ?? []).map((row) => row.deal_id).filter(Boolean));
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
  headlines: Json;
  world_state: Json;
  raw_narrative: string;
  events_ingested: Json;
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
  const { error } = await supabase.from("trader_transactions").upsert(params, {
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

// --- Agent deal selection context ---

export interface DealOutcomeDealStats {
  dealId: string;
  outcomeCount: number;
  wins: number;
  losses: number;
  wipeouts: number;
}

/** Per-deal aggregates from deal_outcomes (for LLM + UI). */
export async function getDealOutcomeStatsByDealIds(
  dealIds: string[]
): Promise<Map<string, DealOutcomeDealStats>> {
  if (dealIds.length === 0) return new Map();
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("deal_outcomes")
    .select("deal_id, trader_pnl_usdc, trader_wiped_out")
    .in("deal_id", dealIds);

  if (error) throw error;

  const map = new Map<string, DealOutcomeDealStats>();
  for (const row of data ?? []) {
    const id = row.deal_id;
    const cur = map.get(id) ?? {
      dealId: id,
      outcomeCount: 0,
      wins: 0,
      losses: 0,
      wipeouts: 0,
    };
    cur.outcomeCount += 1;
    if (row.trader_wiped_out) cur.wipeouts += 1;
    else if (Number(row.trader_pnl_usdc) > 0) cur.wins += 1;
    else cur.losses += 1;
    map.set(id, cur);
  }
  return map;
}

export interface CreatorDealAggStats {
  dealCount: number;
  totalEntries: number;
  totalWipeoutsOnDeals: number;
}

/** Roll up deal creator history (trap-rate signal) across all their deals. */
export async function getCreatorDealAggregates(
  creatorIds: (string | null)[]
): Promise<Map<string, CreatorDealAggStats>> {
  const ids = [...new Set(creatorIds.filter((x): x is string => Boolean(x)))];
  if (ids.length === 0) return new Map();
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("deals")
    .select("creator_id, entry_count, wipeout_count")
    .in("creator_id", ids);

  if (error) throw error;

  const map = new Map<string, CreatorDealAggStats>();
  for (const row of data ?? []) {
    if (!row.creator_id) continue;
    const cur = map.get(row.creator_id) ?? {
      dealCount: 0,
      totalEntries: 0,
      totalWipeoutsOnDeals: 0,
    };
    cur.dealCount += 1;
    cur.totalEntries += row.entry_count ?? 0;
    cur.totalWipeoutsOnDeals += row.wipeout_count ?? 0;
    map.set(row.creator_id, cur);
  }
  return map;
}

export async function getDeskManagerDisplayByIds(
  ids: string[]
): Promise<
  Map<string, { display_name: string | null; wallet_address: string }>
> {
  if (ids.length === 0) return new Map();
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("desk_managers")
    .select("id, display_name, wallet_address")
    .in("id", ids);

  if (error) throw error;

  return new Map(
    (data ?? []).map((d) => [
      d.id,
      { display_name: d.display_name, wallet_address: d.wallet_address },
    ])
  );
}

export async function listTraderIdsByOwnerExcept(
  ownerAddress: string,
  excludeTraderId: string
): Promise<string[]> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("traders")
    .select("id")
    .eq("owner_address", ownerAddress.toLowerCase())
    .neq("id", excludeTraderId);

  if (error) throw error;
  return (data ?? []).map((r) => r.id);
}

export async function getDealIdsEnteredRecentlyByTraders(
  traderIds: string[],
  dealIds: string[],
  sinceIso: string
): Promise<Set<string>> {
  if (traderIds.length === 0 || dealIds.length === 0) return new Set();
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("deal_outcomes")
    .select("deal_id")
    .in("trader_id", traderIds)
    .in("deal_id", dealIds)
    .gte("created_at", sinceIso);

  if (error) throw error;
  return new Set((data ?? []).map((r) => r.deal_id));
}

export async function listRecentOutcomesForTrader(
  traderId: string,
  limit = 5
): Promise<
  {
    trader_pnl_usdc: number;
    trader_wiped_out: boolean;
    created_at: string;
  }[]
> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("deal_outcomes")
    .select("trader_pnl_usdc, trader_wiped_out, created_at")
    .eq("trader_id", traderId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data ?? [];
}

/** Active traders whose last cycle started long enough ago to run again (cron fan-out). */
export async function listActiveTraderIdsStaleForCron(
  staleBefore: Date
): Promise<string[]> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("traders")
    .select("id, last_cycle_at")
    .eq("status", "active");

  if (error) throw error;

  const threshold = staleBefore.getTime();
  return (data ?? [])
    .filter((t) => {
      if (!t.last_cycle_at) return true;
      return new Date(t.last_cycle_at).getTime() < threshold;
    })
    .map((t) => t.id);
}

export async function updateDealAfterEntry(
  dealId: string,
  potChange: number,
  wipeout: boolean
) {
  const supabase = createServerClient();
  // RPC not in generated types — cast to bypass. Fallback below handles failure.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase.rpc as any)("update_deal_after_entry", {
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
