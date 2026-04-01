import { createServerClient } from "./client";

export interface TraderRow {
  id: string;
  token_id: number;
  name: string;
  owner_address: string;
  tba_address: string | null;
  cdp_wallet_address: string | null;
  cdp_owner_address: string | null;
  cdp_account_name: string | null;
  status: "active" | "paused" | "wiped_out";
  mandate: Record<string, unknown>;
  personality: string | null;
  escrow_balance_usdc: number;
  last_cycle_at: string | null;
  created_at: string;
  updated_at: string;
}

export async function getTrader(id: string): Promise<TraderRow> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("traders")
    .select()
    .eq("id", id)
    .single();

  if (error) throw error;
  return data as TraderRow;
}

/**
 * Fetch trader and verify the given wallet address owns it.
 * Throws with a descriptive message on failure.
 */
export async function getOwnedTrader(
  id: string,
  walletAddress: string
): Promise<TraderRow> {
  const trader = await getTrader(id);

  if (trader.owner_address.toLowerCase() !== walletAddress.toLowerCase()) {
    throw new Error("You do not own this trader");
  }

  return trader;
}
