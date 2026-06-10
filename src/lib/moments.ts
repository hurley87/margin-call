/**
 * High-stakes "moment" selection: which new desk-activity entries deserve a
 * full-screen ceremony. Pure for unit testing.
 */

export type MomentKind = "wipeout" | "win" | "loss";

export type Moment = {
  /** Source activity entry id — used for dedup. */
  id: string;
  kind: MomentKind;
  traderId: string;
  traderName: string;
  /** Signed P&L when the entry metadata carries one. */
  amountUsdc?: number;
};

export type MomentActivitySource = {
  id: string;
  trader_id: string;
  activity_type: string;
  metadata: Record<string, unknown>;
};

const SEVERITY: Record<MomentKind, number> = {
  wipeout: 3,
  win: 2,
  loss: 1,
};

function isMomentKind(value: string): value is MomentKind {
  return value in SEVERITY;
}

/**
 * Coalesce a burst of new entries to its single most severe moment
 * (wipeout > win > loss) so an agent cycle never queues a ceremony chain.
 * Wins/losses only qualify when |P&L| clears `bigMoveUsdc`; wipeouts always
 * do. Entries are desk-scoped by the caller (own traders only).
 */
export function selectMoment(
  newEntries: readonly MomentActivitySource[],
  traderNames: Record<string, string>,
  options: { bigMoveUsdc: number }
): Moment | null {
  let best: Moment | null = null;
  for (const entry of newEntries) {
    if (!isMomentKind(entry.activity_type)) continue;
    if (best !== null && SEVERITY[entry.activity_type] <= SEVERITY[best.kind]) {
      continue;
    }
    const pnl = Number(entry.metadata?.pnl);
    const amountUsdc = Number.isFinite(pnl) ? pnl : undefined;
    if (entry.activity_type !== "wipeout") {
      if (
        amountUsdc === undefined ||
        Math.abs(amountUsdc) < options.bigMoveUsdc
      ) {
        continue;
      }
    }
    best = {
      id: entry.id,
      kind: entry.activity_type,
      traderId: entry.trader_id,
      traderName: traderNames[entry.trader_id] ?? "YOUR TRADER",
      amountUsdc,
    };
  }
  return best;
}
