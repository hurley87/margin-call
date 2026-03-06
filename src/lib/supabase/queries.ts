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
