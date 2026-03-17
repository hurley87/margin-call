import { createServerClient } from "./client";

export interface ApprovalRow {
  id: string;
  trader_id: string;
  deal_id: string;
  status: "pending" | "approved" | "rejected" | "expired" | "consumed";
  entry_cost_usdc: number;
  reason: string | null;
  expires_at: string;
  created_at: string;
  updated_at: string;
}

export async function createApproval(
  traderId: string,
  dealId: string,
  entryCostUsdc: number
): Promise<ApprovalRow> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("deal_approvals")
    .insert({
      trader_id: traderId,
      deal_id: dealId,
      entry_cost_usdc: entryCostUsdc,
    })
    .select()
    .single();

  if (error) throw error;
  return data as ApprovalRow;
}

export async function getApproval(id: string): Promise<ApprovalRow> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("deal_approvals")
    .select()
    .eq("id", id)
    .single();

  if (error) throw error;
  return data as ApprovalRow;
}

export async function listPendingApprovals(
  traderId: string
): Promise<ApprovalRow[]> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("deal_approvals")
    .select()
    .eq("trader_id", traderId)
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data ?? []) as ApprovalRow[];
}

export async function listPendingApprovalsByOwner(
  ownerAddress: string
): Promise<
  (ApprovalRow & {
    trader_name: string;
    deal_prompt: string;
    deal_pot_usdc: number;
  })[]
> {
  const supabase = createServerClient();
  const now = new Date().toISOString();

  // Fetch traders and pending (non-expired) approvals in parallel
  const [{ data: traders, error: tErr }] = await Promise.all([
    supabase
      .from("traders")
      .select("id, name")
      .eq("owner_address", ownerAddress.toLowerCase()),
    // Expire stale approvals in background — fire and forget
    supabase
      .from("deal_approvals")
      .update({ status: "expired" })
      .eq("status", "pending")
      .lt("expires_at", now),
  ]);

  if (tErr) throw tErr;
  if (!traders || traders.length === 0) return [];

  const traderIds = traders.map((t) => t.id);
  const traderMap = Object.fromEntries(traders.map((t) => [t.id, t.name]));

  const { data: approvals, error: aErr } = await supabase
    .from("deal_approvals")
    .select()
    .in("trader_id", traderIds)
    .eq("status", "pending")
    .gt("expires_at", now)
    .order("created_at", { ascending: false });

  if (aErr) throw aErr;
  if (!approvals || approvals.length === 0) return [];

  // Fetch deal info for each approval
  const dealIds = [...new Set(approvals.map((a) => a.deal_id))];
  const { data: deals, error: dErr } = await supabase
    .from("deals")
    .select("id, prompt, pot_usdc")
    .in("id", dealIds);

  if (dErr) throw dErr;
  const dealMap = Object.fromEntries(
    (deals ?? []).map((d) => [d.id, { prompt: d.prompt, pot_usdc: d.pot_usdc }])
  );

  return approvals.map((a) => ({
    ...(a as ApprovalRow),
    trader_name: traderMap[a.trader_id] ?? "Unknown",
    deal_prompt: dealMap[a.deal_id]?.prompt ?? "Unknown deal",
    deal_pot_usdc: dealMap[a.deal_id]?.pot_usdc ?? 0,
  }));
}

export async function resolveApproval(
  id: string,
  status: "approved" | "rejected",
  reason?: string
): Promise<ApprovalRow> {
  const supabase = createServerClient();

  // Check if still pending and not expired
  const approval = await getApproval(id);
  if (approval.status !== "pending") {
    throw new Error(`Approval is already ${approval.status}`);
  }
  if (new Date(approval.expires_at) < new Date()) {
    // Auto-expire
    await supabase
      .from("deal_approvals")
      .update({ status: "expired" })
      .eq("id", id);
    throw new Error("Approval has expired");
  }

  const { data, error } = await supabase
    .from("deal_approvals")
    .update({ status, reason: reason ?? null })
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;
  return data as ApprovalRow;
}

/** Check if a deal already has a pending approval for a given trader */
export async function hasPendingApproval(
  traderId: string,
  dealId: string
): Promise<boolean> {
  const supabase = createServerClient();
  const { count, error } = await supabase
    .from("deal_approvals")
    .select("*", { count: "exact", head: true })
    .eq("trader_id", traderId)
    .eq("deal_id", dealId)
    .eq("status", "pending")
    .gt("expires_at", new Date().toISOString());

  if (error) return false;
  return (count ?? 0) > 0;
}

/**
 * Consume a previously approved entry exactly once.
 *
 * This uses a read-then-compare-and-swap update so only one cycle can claim
 * the approval even if multiple cycles race for the same trader/deal.
 */
export async function consumeApprovedEntry(
  traderId: string,
  dealId: string
): Promise<string | null> {
  const supabase = createServerClient();
  const now = new Date().toISOString();

  const { data: approval, error: lookupError } = await supabase
    .from("deal_approvals")
    .select("id")
    .eq("trader_id", traderId)
    .eq("deal_id", dealId)
    .eq("status", "approved")
    .gt("expires_at", now)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (lookupError || !approval) return null;

  const { data: consumed, error: consumeError } = await supabase
    .from("deal_approvals")
    .update({ status: "consumed" })
    .eq("id", approval.id)
    .eq("status", "approved")
    .gt("expires_at", now)
    .select("id")
    .maybeSingle();

  if (consumeError || !consumed) return null;
  return consumed.id;
}
