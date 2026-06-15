/**
 * Agent runtime constants shared across cycle pipeline modules.
 * Mirrors src/lib/constants.ts — kept in sync manually.
 */

/** Skip deals another trader on the same desk entered within this window. */
export const DESK_DEAL_DEDUP_HOURS = 24;

/** 10% rake on winnings. */
export const RAKE_PERCENTAGE = 10;

/** 25% of pot per win (max extraction). */
export const MAX_EXTRACTION_PERCENTAGE = 25;

/**
 * Win/loss is decided mechanically in code (not by the LLM). These tune the
 * odds and sizing; the LLM only narrates the pre-decided result.
 */
/** Baseline probability a deal resolves as a win, before market modifiers. */
export const BASE_WIN_PROBABILITY = 0.5;
/** Max amount market mood / SEC heat can shift the win probability each way. */
export const WIN_PROB_MARKET_SWING = 0.15;
/** Hard bounds on the modified win probability. */
export const MIN_WIN_PROBABILITY = 0.15;
export const MAX_WIN_PROBABILITY = 0.85;
/**
 * Win/loss magnitudes are both sized off the trader's ENTRY COST (stake), so a
 * deal is a fair-ish bet on the stake rather than an uncapped raid on the pot.
 * Average loss > average win is the deliberate house edge: it grows the deal's
 * pot (the creator's incentive to host deals) and keeps a baseline trader
 * slightly net-negative (no auto-earn). With a 10% rake on wins, break-even sits
 * at a win probability of ~0.59 — traders only profit by playing favorable
 * markets. Retune freely; LOSS_MAGNITUDE_MAX_FRACTION must stay ≤ 1.0 (a trader
 * can't lose more than they staked).
 */
/** On a win, trader gains a random fraction of their entry cost. Avg ≈ 0.65×. */
export const WIN_MAGNITUDE_MIN_FRACTION = 0.3;
export const WIN_MAGNITUDE_MAX_FRACTION = 1.0;
/** On a loss, trader loses a random fraction of their entry cost. Avg ≈ 0.85×. */
export const LOSS_MAGNITUDE_MIN_FRACTION = 0.7;
export const LOSS_MAGNITUDE_MAX_FRACTION = 1.0;

/** Approval expiry: 24 hours from request time. */
export const APPROVAL_EXPIRY_MS = 24 * 60 * 60 * 1000;

/** Deal seed suggested value caps — LLM output is clamped to these in the Zod schema. */
export const MAX_SUGGESTED_POT_USDC = 10;
export const MAX_SUGGESTED_ENTRY_USDC = 5;
