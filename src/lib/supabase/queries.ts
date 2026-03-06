import { createServerClient } from "./client";

export interface CreateDealParams {
  creator_id: string;
  creator_type: "desk_manager" | "agent";
  prompt: string;
  pot_usdc: number;
  entry_cost_usdc: number;
  max_extraction_percentage?: number;
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

export interface CreateDealOutcomeParams {
  deal_id: string;
  trader_id: string;
  narrative: { event: string; description: string }[];
  trader_pnl_usdc: number;
  pot_change_usdc: number;
  rake_usdc: number;
  assets_gained: { name: string; value_usdc: number }[];
  assets_lost: string[];
  trader_wiped_out: boolean;
  wipeout_reason?: string;
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
