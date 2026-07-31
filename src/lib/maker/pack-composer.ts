import type { Address, Hash, TransactionReceipt } from "viem";

import {
  executeMakerWrite,
  type LifecycleJournalRun,
} from "./transaction-journal";

export type TokenAmountInput = {
  symbol: string;
  address: Address;
  decimals: number;
  value: string;
  balance?: bigint;
  allowance?: bigint;
  quote?: bigint;
  quoteError?: string;
};

export type SelectedPackToken = {
  symbol: string;
  address: Address;
  amount: bigint;
  allowance: bigint;
  quote: bigint;
};

export type PackPlan = {
  selected: SelectedPackToken[];
  nav: bigint;
  approvals: SelectedPackToken[];
  errors: string[];
  eligible: boolean;
};

export type TransactionPhase =
  | { kind: "idle" }
  | { kind: "approving"; symbol: string }
  | { kind: "approval-pending"; symbol: string; hash: Hash }
  | { kind: "minting" }
  | { kind: "mint-pending"; hash: Hash }
  | { kind: "enrolling"; tokenId: bigint }
  | { kind: "enrollment-pending"; tokenId: bigint; hash: Hash }
  | { kind: "complete"; tokenId: bigint }
  | { kind: "error"; message: string; hash?: Hash };

export type PackTransactionAdapter = {
  approve: (token: Address, amount: bigint) => Promise<Hash>;
  mint: (assets: Address[], amounts: bigint[]) => Promise<Hash>;
  enterPool: (tokenId: bigint) => Promise<Hash>;
  waitForReceipt: (hash: Hash) => Promise<TransactionReceipt>;
  getMintedTokenId: (receipt: TransactionReceipt) => bigint;
};

export function parseTokenAmount(
  value: string,
  decimals: number
): { ok: true; amount: bigint } | { ok: false; error: string } {
  const normalized = value.trim();
  if (!normalized) return { ok: false, error: "Enter an amount" };
  if (!Number.isInteger(decimals) || decimals < 0) {
    return { ok: false, error: "Invalid token decimals" };
  }

  const match = /^(0|[1-9]\d*)(?:\.(\d+))?$/.exec(normalized);
  if (!match) {
    return { ok: false, error: "Use a positive decimal amount" };
  }

  const fraction = match[2] ?? "";
  if (fraction.length > decimals) {
    return { ok: false, error: `Maximum ${decimals} decimal places` };
  }

  const whole = BigInt(match[1]);
  const paddedFraction = fraction.padEnd(decimals, "0");
  const amount =
    whole * 10n ** BigInt(decimals) +
    (paddedFraction ? BigInt(paddedFraction) : 0n);

  if (amount === 0n) {
    return { ok: false, error: "Amount must be greater than zero" };
  }

  return { ok: true, amount };
}

export function isNavInBand(
  nav: bigint,
  minPackNav: bigint,
  poolMax: bigint
): boolean {
  return nav >= minPackNav && nav <= poolMax;
}

export function buildPackPlan(
  inputs: TokenAmountInput[],
  minPackNav?: bigint,
  poolMax?: bigint
): PackPlan {
  const errors: string[] = [];
  const selected: SelectedPackToken[] = [];

  for (const input of inputs) {
    if (!input.value.trim()) continue;
    const parsed = parseTokenAmount(input.value, input.decimals);
    if (!parsed.ok) {
      errors.push(`${input.symbol}: ${parsed.error}`);
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
    selected.push({
      symbol: input.symbol,
      address: input.address,
      amount: parsed.amount,
      allowance: input.allowance,
      quote: input.quote,
    });
  }

  if (inputs.every((input) => !input.value.trim())) {
    errors.push("Add at least one Stock Token to the Pack");
  } else if (selected.length === 0 && errors.length === 0) {
    errors.push("The Pack basket cannot be empty");
  }

  const nav = selected.reduce((sum, token) => sum + token.quote, 0n);
  let eligible = false;
  if (minPackNav === undefined || poolMax === undefined) {
    errors.push("Live Pack eligibility band unavailable");
  } else if (selected.length > 0) {
    const navInBand = isNavInBand(nav, minPackNav, poolMax);
    eligible = errors.length === 0 && navInBand;
    if (!navInBand) {
      errors.push("Basket NAV is outside the live eligibility band");
    }
  }

  return {
    selected,
    nav,
    approvals: selected.filter((token) => token.allowance < token.amount),
    errors,
    eligible,
  };
}

export function transactionPhaseMessage(phase: TransactionPhase): string {
  switch (phase.kind) {
    case "idle":
      return "Ready to create a Pack";
    case "approving":
      return `Approve ${phase.symbol} in your wallet`;
    case "approval-pending":
      return `${phase.symbol} approval submitted — waiting for confirmation`;
    case "minting":
      return "Confirm Pack mint in your wallet";
    case "mint-pending":
      return "Pack mint submitted — waiting for confirmation";
    case "enrolling":
      return `Pack #${phase.tokenId} minted. Confirm pool enrollment`;
    case "enrollment-pending":
      return `Pack #${phase.tokenId} enrollment submitted — waiting for confirmation`;
    case "complete":
      return `Pack #${phase.tokenId} minted and enrolled`;
    case "error":
      return phase.message;
  }
}

function requireSuccessfulReceipt(receipt: TransactionReceipt, label: string) {
  if (receipt.status !== "success") {
    throw new Error(`${label} transaction reverted`);
  }
}

export async function enrollMintedPack(
  tokenId: bigint,
  adapter: PackTransactionAdapter,
  onPhase: (phase: TransactionPhase) => void,
  journal?: LifecycleJournalRun
): Promise<void> {
  onPhase({ kind: "enrolling", tokenId });
  const receipt = await executeMakerWrite({
    journal,
    step: "enterPool",
    action: "enterPool",
    submit: () => adapter.enterPool(tokenId),
    reconcile: adapter.waitForReceipt,
    onAccepted: (hash) =>
      onPhase({ kind: "enrollment-pending", tokenId, hash }),
  });
  requireSuccessfulReceipt(receipt, "Pool enrollment");
  onPhase({ kind: "complete", tokenId });
}

export async function createAndEnrollPack(
  plan: Pick<PackPlan, "selected" | "approvals">,
  adapter: PackTransactionAdapter,
  onPhase: (phase: TransactionPhase) => void,
  onMinted: (tokenId: bigint) => void,
  journal?: LifecycleJournalRun
): Promise<bigint> {
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

  onPhase({ kind: "minting" });
  const mintReceipt = await executeMakerWrite({
    journal,
    step: "mint",
    action: "mint",
    submit: () =>
      adapter.mint(
        plan.selected.map((token) => token.address),
        plan.selected.map((token) => token.amount)
      ),
    reconcile: adapter.waitForReceipt,
    onAccepted: (hash) => onPhase({ kind: "mint-pending", hash }),
  });
  requireSuccessfulReceipt(mintReceipt, "Pack mint");

  const tokenId = adapter.getMintedTokenId(mintReceipt);
  onMinted(tokenId);
  await enrollMintedPack(tokenId, adapter, onPhase, journal);
  return tokenId;
}
