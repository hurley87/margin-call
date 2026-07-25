/**
 * Chain intent status machine (#249).
 * Pure TypeScript — no Convex imports. Thin wrappers live in convex/chainIntents.ts.
 */

export const CHAIN_INTENT_STATUSES = [
  "prepared",
  "signing",
  "submitted",
  "confirmed",
  "failed",
  "reconciling",
  "abandoned",
] as const;

export type ChainIntentStatus = (typeof CHAIN_INTENT_STATUSES)[number];

/** Terminal statuses — no further transitions allowed. */
export const TERMINAL_STATUSES: ReadonlySet<ChainIntentStatus> = new Set([
  "confirmed",
  "failed",
  "abandoned",
]);

/**
 * Legal transitions. Ambiguous submissions move to `reconciling` and are
 * resolved by transaction identity — never by re-signing or resubmitting.
 */
export const LEGAL_TRANSITIONS: Readonly<
  Record<ChainIntentStatus, readonly ChainIntentStatus[]>
> = {
  prepared: ["signing", "submitted", "abandoned", "failed"],
  signing: ["submitted", "failed", "abandoned", "reconciling"],
  submitted: ["confirmed", "failed", "reconciling"],
  reconciling: ["confirmed", "failed", "abandoned", "reconciling"],
  confirmed: [],
  failed: [],
  abandoned: [],
};

export function isTerminalStatus(status: ChainIntentStatus): boolean {
  return TERMINAL_STATUSES.has(status);
}

export function canTransition(
  from: ChainIntentStatus,
  to: ChainIntentStatus
): boolean {
  if (from === to && from === "reconciling") return true;
  return LEGAL_TRANSITIONS[from].includes(to);
}

/**
 * Assert a status transition is legal. Throws on illegal transitions.
 */
export function assertTransition(
  from: ChainIntentStatus,
  to: ChainIntentStatus
): void {
  if (!canTransition(from, to)) {
    throw new Error(
      `Illegal chain intent transition: ${from} → ${to}. Allowed from ${from}: [${LEGAL_TRANSITIONS[from].join(", ") || "none"}].`
    );
  }
}

/** Statuses that may still be reused under the same intentKey on re-prepare. */
export function isReusableStatus(status: ChainIntentStatus): boolean {
  return status === "prepared" || status === "signing";
}
