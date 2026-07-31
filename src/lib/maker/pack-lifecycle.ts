import type { Address, Hash, TransactionReceipt } from "viem";

import { isNavInBand, parseTokenAmount } from "./pack-composer";
import {
  executeMakerWrite,
  type LifecycleJournalRun,
} from "./transaction-journal";

export type TopUpTokenInput = {
  symbol: string;
  address: Address;
  decimals: number;
  value: string;
  approved?: boolean;
  balance?: bigint;
  allowance?: bigint;
  quote?: bigint;
  quoteError?: string;
};

export type TopUpToken = {
  symbol: string;
  address: Address;
  amount: bigint;
  allowance: bigint;
  quote: bigint;
};

export type TopUpPlan = {
  additions: TopUpToken[];
  approvals: TopUpToken[];
  currentNav: bigint;
  projectedNav: bigint;
  eligible: boolean;
  errors: string[];
};

export type TopUpPhase =
  | { kind: "idle" }
  | { kind: "approving"; symbol: string }
  | { kind: "approval-pending"; symbol: string; hash: Hash }
  | { kind: "topping-up" }
  | { kind: "top-up-pending"; hash: Hash }
  | { kind: "syncing" }
  | { kind: "sync-pending"; hash: Hash }
  | { kind: "complete" }
  | { kind: "error"; message: string; hash?: Hash };

export type TopUpTransactionAdapter = {
  approve: (token: Address, amount: bigint) => Promise<Hash>;
  topUp: (
    tokenId: bigint,
    assets: Address[],
    amounts: bigint[]
  ) => Promise<Hash>;
  syncPackNav: (tokenId: bigint) => Promise<Hash>;
  waitForReceipt: (hash: Hash) => Promise<TransactionReceipt>;
};

export type RedemptionPhase =
  | { kind: "idle" }
  | { kind: "exiting" }
  | { kind: "exit-pending"; hash: Hash }
  | { kind: "redeeming" }
  | { kind: "redeem-pending"; hash: Hash }
  | { kind: "complete" }
  | { kind: "error"; message: string; hash?: Hash };

export type RedemptionTransactionAdapter = {
  exitPool: (tokenId: bigint) => Promise<Hash>;
  delistAndRedeem: (tokenId: bigint) => Promise<Hash>;
  waitForReceipt: (hash: Hash) => Promise<TransactionReceipt>;
};

export function buildTopUpPlan(
  inputs: TopUpTokenInput[],
  currentNav?: bigint,
  minPackNav?: bigint,
  poolMax?: bigint,
  basketError?: string
): TopUpPlan {
  const errors: string[] = [];
  const additions: TopUpToken[] = [];

  if (basketError) errors.push(basketError);
  if (currentNav === undefined) errors.push("Live basket NAV unavailable");

  for (const input of inputs) {
    if (!input.value.trim()) continue;
    const parsed = parseTokenAmount(input.value, input.decimals);
    if (!parsed.ok) {
      errors.push(`${input.symbol}: ${parsed.error}`);
      continue;
    }
    if (input.approved !== true) {
      errors.push(`${input.symbol}: token is not currently approved`);
      continue;
    }
    if (input.balance === undefined) {
      errors.push(`${input.symbol}: wallet balance unavailable`);
      continue;
    }
    if (parsed.amount > input.balance) {
      errors.push(`${input.symbol}: amount exceeds wallet balance`);
      continue;
    }
    if (input.allowance === undefined) {
      errors.push(`${input.symbol}: allowance unavailable`);
      continue;
    }
    if (input.quoteError || input.quote === undefined) {
      errors.push(
        `${input.symbol}: ${input.quoteError ?? "live quote unavailable"}`
      );
      continue;
    }
    additions.push({
      symbol: input.symbol,
      address: input.address,
      amount: parsed.amount,
      allowance: input.allowance,
      quote: input.quote,
    });
  }

  if (inputs.every((input) => !input.value.trim())) {
    errors.push("Add at least one approved Stock Token");
  }

  const baseNav = currentNav ?? 0n;
  const projectedNav = additions.reduce(
    (sum, token) => sum + token.quote,
    baseNav
  );
  let eligible = false;
  if (minPackNav === undefined || poolMax === undefined) {
    errors.push("Live Pack eligibility band unavailable");
  } else if (additions.length > 0 && currentNav !== undefined) {
    eligible =
      errors.length === 0 && isNavInBand(projectedNav, minPackNav, poolMax);
    if (!isNavInBand(projectedNav, minPackNav, poolMax)) {
      errors.push("Projected Pack NAV is outside the live eligibility band");
    }
  }

  return {
    additions,
    approvals: additions.filter((token) => token.allowance < token.amount),
    currentNav: baseNav,
    projectedNav,
    eligible,
    errors,
  };
}

function requireSuccessfulReceipt(receipt: TransactionReceipt, label: string) {
  if (receipt.status !== "success") {
    throw new Error(`${label} transaction reverted`);
  }
}

export async function syncConfirmedTopUp(
  tokenId: bigint,
  adapter: TopUpTransactionAdapter,
  onPhase: (phase: TopUpPhase) => void,
  journal?: LifecycleJournalRun
): Promise<void> {
  onPhase({ kind: "syncing" });
  const receipt = await executeMakerWrite({
    journal,
    step: "syncPackNav",
    action: "syncPackNav",
    submit: () => adapter.syncPackNav(tokenId),
    reconcile: adapter.waitForReceipt,
    onAccepted: (hash) => onPhase({ kind: "sync-pending", hash }),
  });
  requireSuccessfulReceipt(receipt, "Pack NAV sync");
  onPhase({ kind: "complete" });
}

export async function topUpAndSyncPack(
  tokenId: bigint,
  plan: Pick<TopUpPlan, "additions" | "approvals">,
  adapter: TopUpTransactionAdapter,
  onPhase: (phase: TopUpPhase) => void,
  onTopUpConfirmed: () => void,
  journal?: LifecycleJournalRun
): Promise<void> {
  for (const token of plan.approvals) {
    onPhase({ kind: "approving", symbol: token.symbol });
    const receipt = await executeMakerWrite({
      journal,
      step: `approve:${token.address.toLowerCase()}:${token.amount}`,
      action: "approve",
      submit: () => adapter.approve(token.address, token.amount),
      reconcile: adapter.waitForReceipt,
      onAccepted: (hash) =>
        onPhase({ kind: "approval-pending", symbol: token.symbol, hash }),
    });
    requireSuccessfulReceipt(receipt, `${token.symbol} approval`);
  }

  onPhase({ kind: "topping-up" });
  const receipt = await executeMakerWrite({
    journal,
    step: "topUp",
    action: "topUp",
    submit: () =>
      adapter.topUp(
        tokenId,
        plan.additions.map((token) => token.address),
        plan.additions.map((token) => token.amount)
      ),
    reconcile: adapter.waitForReceipt,
    onAccepted: (hash) => onPhase({ kind: "top-up-pending", hash }),
  });
  requireSuccessfulReceipt(receipt, "Pack top-up");
  onTopUpConfirmed();

  await syncConfirmedTopUp(tokenId, adapter, onPhase, journal);
}

export async function redeemExitedPack(
  tokenId: bigint,
  adapter: RedemptionTransactionAdapter,
  onPhase: (phase: RedemptionPhase) => void,
  journal?: LifecycleJournalRun
): Promise<void> {
  onPhase({ kind: "redeeming" });
  const receipt = await executeMakerWrite({
    journal,
    step: "delistAndRedeem",
    action: "delistAndRedeem",
    submit: () => adapter.delistAndRedeem(tokenId),
    reconcile: adapter.waitForReceipt,
    onAccepted: (hash) => onPhase({ kind: "redeem-pending", hash }),
  });
  requireSuccessfulReceipt(receipt, "Pack redemption");
  onPhase({ kind: "complete" });
}

export async function exitAndRedeemPack(
  tokenId: bigint,
  state: { isResting: boolean; isListed: boolean },
  adapter: RedemptionTransactionAdapter,
  onPhase: (phase: RedemptionPhase) => void,
  onExitConfirmed: () => void,
  journal?: LifecycleJournalRun
): Promise<void> {
  if (!state.isListed) throw new Error("Pack is no longer listed");

  if (state.isResting) {
    onPhase({ kind: "exiting" });
    const receipt = await executeMakerWrite({
      journal,
      step: "exitPool",
      action: "exitPool",
      submit: () => adapter.exitPool(tokenId),
      reconcile: adapter.waitForReceipt,
      onAccepted: (hash) => onPhase({ kind: "exit-pending", hash }),
    });
    requireSuccessfulReceipt(receipt, "Pool exit");
    onExitConfirmed();
  }

  await redeemExitedPack(tokenId, adapter, onPhase, journal);
}

export function topUpPhaseMessage(phase: TopUpPhase): string {
  switch (phase.kind) {
    case "idle":
      return "Ready to add Stock Tokens";
    case "approving":
      return `Approve ${phase.symbol} in your wallet`;
    case "approval-pending":
      return `${phase.symbol} approval submitted — waiting for confirmation`;
    case "topping-up":
      return "Confirm Pack top-up in your wallet";
    case "top-up-pending":
      return "Pack top-up submitted — waiting for confirmation";
    case "syncing":
      return "Top-up confirmed. Confirm NAV sync in your wallet";
    case "sync-pending":
      return "NAV sync submitted — waiting for confirmation";
    case "complete":
      return "Pack top-up and NAV sync confirmed";
    case "error":
      return phase.message;
  }
}

export function redemptionPhaseMessage(phase: RedemptionPhase): string {
  switch (phase.kind) {
    case "idle":
      return "Ready to delist and redeem";
    case "exiting":
      return "Confirm pool exit to crystallize pending fees";
    case "exit-pending":
      return "Pool exit submitted — waiting for confirmation";
    case "redeeming":
      return "Confirm zero-fee Pack redemption in your wallet";
    case "redeem-pending":
      return "Pack redemption submitted — waiting for confirmation";
    case "complete":
      return "Pack delisted and basket redeemed";
    case "error":
      return phase.message;
  }
}
