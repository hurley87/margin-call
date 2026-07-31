import type { Hash } from "viem";

export const JOURNAL_PREFIX = "margin-call:maker-lifecycle:v1:";

export type MakerWriteAction =
  | "approve"
  | "mint"
  | "enterPool"
  | "topUp"
  | "syncPackNav"
  | "exitPool"
  | "delistAndRedeem"
  | "claim";

export type WorkflowKind = "create" | "top-up" | "redemption" | "claim";

export type WorkflowContext = Record<
  string,
  string | number | boolean | string[] | undefined
>;

export type AcceptedTransaction = {
  step: string;
  action: MakerWriteAction;
  hash: Hash;
  acceptedAt: number;
};

export type LifecycleWorkflow = {
  key: string;
  chainId: number;
  wallet: string;
  kind: WorkflowKind;
  requestFingerprint: string;
  context: WorkflowContext;
  completed: Record<string, Hash>;
  current?: AcceptedTransaction;
  lastRevert?: AcceptedTransaction;
  createdAt: number;
  updatedAt: number;
};

export type JournalStorage = {
  get: (key: string) => LifecycleWorkflow | null;
  set: (workflow: LifecycleWorkflow) => void;
  remove: (key: string) => void;
  list: () => LifecycleWorkflow[];
};

export type JournalReceipt = { status: "success" | "reverted" };

export type LifecycleJournalRun = {
  storage: JournalStorage;
  workflowKey: string;
};

export class PendingTransactionError extends Error {
  readonly hash: Hash;

  constructor(hash: Hash, cause: unknown) {
    super(
      `Transaction ${hash} is still unresolved. Reconciliation will retry without resubmitting.`,
      { cause }
    );
    this.name = "PendingTransactionError";
    this.hash = hash;
  }
}

export class RevertedTransactionError extends Error {
  readonly hash: Hash;

  constructor(hash: Hash, action: MakerWriteAction) {
    super(`${action} transaction ${hash} reverted`);
    this.name = "RevertedTransactionError";
    this.hash = hash;
  }
}

function normalizeWallet(wallet: string): string {
  return wallet.trim().toLowerCase();
}

function fnv1a(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function requestFingerprint(
  parts: readonly (string | bigint)[]
): string {
  return fnv1a(parts.map(String).join("\u001f"));
}

export function workflowKey(args: {
  chainId: number;
  wallet: string;
  kind: WorkflowKind;
  requestFingerprint: string;
}): string {
  return `${JOURNAL_PREFIX}${args.chainId}:${normalizeWallet(args.wallet)}:${args.kind}:${args.requestFingerprint}`;
}

export function createMemoryJournalStorage(): JournalStorage {
  const values = new Map<string, LifecycleWorkflow>();
  return {
    get: (key) => values.get(key) ?? null,
    set: (workflow) => values.set(workflow.key, structuredClone(workflow)),
    remove: (key) => values.delete(key),
    list: () => [...values.values()].map((value) => structuredClone(value)),
  };
}

export function createBrowserJournalStorage(): JournalStorage {
  const storage = window.localStorage;
  return {
    get(key) {
      const raw = storage.getItem(key);
      return raw ? (JSON.parse(raw) as LifecycleWorkflow) : null;
    },
    set(workflow) {
      storage.setItem(workflow.key, JSON.stringify(workflow));
    },
    remove(key) {
      storage.removeItem(key);
    },
    list() {
      const workflows: LifecycleWorkflow[] = [];
      for (let index = 0; index < storage.length; index += 1) {
        const key = storage.key(index);
        if (!key?.startsWith(JOURNAL_PREFIX)) continue;
        const raw = storage.getItem(key);
        if (raw) workflows.push(JSON.parse(raw) as LifecycleWorkflow);
      }
      return workflows;
    },
  };
}

export function ensureWorkflow(
  storage: JournalStorage,
  args: {
    chainId: number;
    wallet: string;
    kind: WorkflowKind;
    requestFingerprint: string;
    context: WorkflowContext;
  }
): LifecycleWorkflow {
  const key = workflowKey(args);
  const existing = storage.get(key);
  if (existing) return existing;
  const now = Date.now();
  const workflow: LifecycleWorkflow = {
    key,
    chainId: args.chainId,
    wallet: normalizeWallet(args.wallet),
    kind: args.kind,
    requestFingerprint: args.requestFingerprint,
    context: args.context,
    completed: {},
    createdAt: now,
    updatedAt: now,
  };
  storage.set(workflow);
  return workflow;
}

export function listWorkflows(
  storage: JournalStorage,
  chainId: number,
  wallet: string,
  kind?: WorkflowKind
): LifecycleWorkflow[] {
  const normalized = normalizeWallet(wallet);
  return storage
    .list()
    .filter(
      (workflow) =>
        workflow.chainId === chainId &&
        workflow.wallet === normalized &&
        (!kind || workflow.kind === kind)
    )
    .sort((a, b) => a.createdAt - b.createdAt);
}

export async function runJournaledStep<TReceipt extends JournalReceipt>(args: {
  storage: JournalStorage;
  workflowKey: string;
  step: string;
  action: MakerWriteAction;
  submit: () => Promise<Hash>;
  reconcile: (hash: Hash) => Promise<TReceipt>;
  onAccepted?: (hash: Hash, recovered: boolean) => void;
}): Promise<{ hash: Hash; receipt: TReceipt; recovered: boolean }> {
  let workflow = args.storage.get(args.workflowKey);
  if (!workflow) throw new Error("Lifecycle workflow is missing");

  const completedHash = workflow.completed[args.step];
  if (completedHash) {
    args.onAccepted?.(completedHash, true);
    let receipt: TReceipt;
    try {
      receipt = await args.reconcile(completedHash);
    } catch (error) {
      throw new PendingTransactionError(completedHash, error);
    }
    if (receipt.status !== "success") {
      throw new Error(
        `Previously confirmed ${args.action} no longer has a successful receipt`
      );
    }
    return { hash: completedHash, receipt, recovered: true };
  }

  if (workflow.current && workflow.current.step !== args.step) {
    throw new PendingTransactionError(
      workflow.current.hash,
      new Error(`Resolve ${workflow.current.action} before ${args.action}`)
    );
  }

  const recovered = Boolean(workflow.current);
  let accepted = workflow.current;
  if (!accepted) {
    const hash = await args.submit();
    accepted = {
      step: args.step,
      action: args.action,
      hash,
      acceptedAt: Date.now(),
    };
    workflow = { ...workflow, current: accepted, updatedAt: Date.now() };
    // This synchronous write is intentionally before any receipt polling.
    args.storage.set(workflow);
  }
  args.onAccepted?.(accepted.hash, recovered);

  let receipt: TReceipt;
  try {
    receipt = await args.reconcile(accepted.hash);
  } catch (error) {
    throw new PendingTransactionError(accepted.hash, error);
  }

  workflow = args.storage.get(args.workflowKey);
  if (!workflow)
    throw new Error("Lifecycle workflow disappeared during reconciliation");
  if (receipt.status === "reverted") {
    args.storage.set({
      ...workflow,
      current: undefined,
      lastRevert: accepted,
      updatedAt: Date.now(),
    });
    throw new RevertedTransactionError(accepted.hash, accepted.action);
  }

  args.storage.set({
    ...workflow,
    current: undefined,
    completed: { ...workflow.completed, [args.step]: accepted.hash },
    updatedAt: Date.now(),
  });
  return { hash: accepted.hash, receipt, recovered };
}

export async function executeMakerWrite<TReceipt extends JournalReceipt>(args: {
  journal?: LifecycleJournalRun;
  step: string;
  action: MakerWriteAction;
  submit: () => Promise<Hash>;
  reconcile: (hash: Hash) => Promise<TReceipt>;
  onAccepted: (hash: Hash, recovered: boolean) => void;
}): Promise<TReceipt> {
  if (!args.journal) {
    const hash = await args.submit();
    args.onAccepted(hash, false);
    return await args.reconcile(hash);
  }
  const result = await runJournaledStep({
    storage: args.journal.storage,
    workflowKey: args.journal.workflowKey,
    step: args.step,
    action: args.action,
    submit: args.submit,
    reconcile: args.reconcile,
    onAccepted: args.onAccepted,
  });
  return result.receipt;
}
