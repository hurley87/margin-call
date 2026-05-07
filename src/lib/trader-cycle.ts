import type { Doc } from "../../convex/_generated/dataModel";
import {
  DEFAULT_CYCLE_INTERVAL_MS,
  SPEED_TOKEN_CYCLE_INTERVAL_MS,
} from "@/lib/constants";

/** Fields needed for cycle eligibility display (Convex trader doc subset). */
export type TraderCycleDoc = Pick<
  Doc<"traders">,
  "status" | "walletStatus" | "lastCycleAt" | "cycleLeaseUntil" | "walletError"
> & {
  /** Future: persisted flag when speed token applies (no contract reads). */
  speedTokenEligible?: boolean;
};

export function resolveTraderCycleIntervalMs(trader: TraderCycleDoc): number {
  if (trader.speedTokenEligible === true) {
    return SPEED_TOKEN_CYCLE_INTERVAL_MS;
  }
  return DEFAULT_CYCLE_INTERVAL_MS;
}

export type TraderCycleDisplayState =
  | { kind: "wiped" }
  | { kind: "paused" }
  | { kind: "wallet_pending" }
  | { kind: "wallet_creating" }
  | { kind: "wallet_error"; walletError?: string }
  | { kind: "running" }
  | { kind: "ready_no_prior_cycle" }
  | { kind: "ready_next_tick" }
  | {
      kind: "countdown";
      remainingMs: number;
    };

export function getTraderCycleDisplayState(
  trader: TraderCycleDoc,
  nowMs: number
): TraderCycleDisplayState {
  if (trader.status === "wiped_out") {
    return { kind: "wiped" };
  }
  if (trader.status === "paused") {
    return { kind: "paused" };
  }

  switch (trader.walletStatus) {
    case "pending":
      return { kind: "wallet_pending" };
    case "creating":
      return { kind: "wallet_creating" };
    case "error":
      return { kind: "wallet_error", walletError: trader.walletError };
    case "ready":
      break;
  }

  const leaseUntil = trader.cycleLeaseUntil;
  if (leaseUntil !== undefined && leaseUntil > nowMs) {
    return { kind: "running" };
  }

  const lastCycle = trader.lastCycleAt;
  if (lastCycle === undefined) {
    return { kind: "ready_no_prior_cycle" };
  }

  const intervalMs = resolveTraderCycleIntervalMs(trader);
  const nextEligibleAt = lastCycle + intervalMs;
  const remainingMs = nextEligibleAt - nowMs;

  if (remainingMs <= 0) {
    return { kind: "ready_next_tick" };
  }

  return {
    kind: "countdown",
    remainingMs,
  };
}

export function formatRemainingMs(remainingMs: number): string {
  const totalSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

const CYCLE_UI_STATIC: Record<
  Exclude<TraderCycleDisplayState["kind"], "countdown">,
  { text: string; className: string }
> = {
  wiped: { text: "[WIPED]", className: "text-[var(--t-red)]" },
  paused: { text: "[PAUSED]", className: "text-[var(--t-amber)]" },
  wallet_pending: {
    text: "[WALLET PENDING]",
    className: "text-[var(--t-muted)]",
  },
  wallet_creating: {
    text: "[WALLET CREATING]",
    className: "text-[var(--t-amber)]",
  },
  wallet_error: { text: "[WALLET ERROR]", className: "text-[var(--t-red)]" },
  running: { text: "[RUNNING]", className: "text-[var(--t-amber)]" },
  ready_no_prior_cycle: { text: "[READY]", className: "text-[var(--t-green)]" },
  ready_next_tick: {
    text: "[READY ON NEXT TICK]",
    className: "text-[var(--t-green)]",
  },
};

export function getTraderCycleUiLabel(state: TraderCycleDisplayState): {
  text: string;
  className: string;
} {
  if (state.kind === "countdown") {
    return {
      text: `[NEXT IN ${formatRemainingMs(state.remainingMs)}]`,
      className: "text-[var(--t-muted)]",
    };
  }
  return CYCLE_UI_STATIC[state.kind];
}

export function getTraderCycleUi(
  trader: TraderCycleDoc,
  nowMs: number
): { text: string; className: string } {
  return getTraderCycleUiLabel(getTraderCycleDisplayState(trader, nowMs));
}

/** Portfolio / desk roster row (`usePortfolio` snake_case). */
export function traderCycleDocFromDeskSummary(summary: {
  status: string;
  wallet_status: TraderCycleDoc["walletStatus"];
  last_cycle_at?: number;
  cycle_lease_until?: number;
  wallet_error?: string;
}): TraderCycleDoc {
  return {
    status: summary.status as TraderCycleDoc["status"],
    walletStatus: summary.wallet_status,
    lastCycleAt: summary.last_cycle_at,
    cycleLeaseUntil: summary.cycle_lease_until,
    walletError: summary.wallet_error,
  };
}

/** `useTrader` mapped shape (snake_case timestamps). */
export function traderCycleDocFromDetailTrader(trader: {
  status: TraderCycleDoc["status"];
  wallet_status: TraderCycleDoc["walletStatus"];
  last_cycle_at_ms: number | null;
  cycle_lease_until_ms: number | null;
  wallet_error: string | null;
}): TraderCycleDoc {
  return {
    status: trader.status,
    walletStatus: trader.wallet_status,
    lastCycleAt: trader.last_cycle_at_ms ?? undefined,
    cycleLeaseUntil: trader.cycle_lease_until_ms ?? undefined,
    walletError: trader.wallet_error ?? undefined,
  };
}
