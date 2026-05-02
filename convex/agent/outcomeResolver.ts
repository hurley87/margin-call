"use node";

/**
 * Convex-native outcome resolver.
 *
 * Calls GPT-4o-mini to generate a deal outcome for a given trader/deal pair.
 * Reads context (assets, market narrative, system prompt) via Convex internal
 * queries. Does NOT write to the database — the caller persists the result.
 *
 * Idempotency: the caller (cycle action) guards with a CAS on (traderId, dealId)
 * before calling this function, and uses internal.dealOutcomes.apply which is
 * itself idempotent.
 */

import OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod";
import type { RunActionCtx } from "./_ctx";
import { internal } from "../_generated/api";
import { RAKE_PERCENTAGE, MAX_EXTRACTION_PERCENTAGE } from "./_constants";
import { DealOutcomeSchema, type DealOutcomePayload } from "./_schemas";
import type { Deal } from "./_types";

const FALLBACK_DEAL_OUTCOME_SYSTEM = `You are the outcome engine for a 1980s Wall Street trading game.
When a trader enters a deal, you resolve the outcome with vivid, terse prose and structured data.
Always return valid JSON matching the schema. Keep narrative to 2-3 short sentences.`;

export interface OutcomeResolverInput {
  deal: Deal;
  traderId: string;
  traderName: string;
  escrowBalanceUsdc: number;
}

export interface ResolvedOutcome {
  /** Raw LLM output */
  payload: DealOutcomePayload;
  /** Validated PnL (clamped to balance and max extraction) */
  traderPnlUsdc: number;
  /** True if the trader is wiped out */
  traderWipedOut: boolean;
  wipeoutReason: string | null;
  narrative: string;
  assetsGained: Array<{ name: string; value_usdc: number }>;
  assetsLost: string[];
}

/**
 * Resolve a deal outcome by calling the LLM.
 *
 * If the LLM fails, throws — the caller should release the cycle lease
 * and log the error so the next cycle retries.
 */
export async function resolveOutcome(
  ctx: RunActionCtx,
  input: OutcomeResolverInput
): Promise<ResolvedOutcome> {
  const { deal, traderId, traderName, escrowBalanceUsdc } = input;

  // ── Load context (assets + market narrative + system prompt) ───────────────
  const [assets, marketNarrative, systemPromptContent] = await Promise.all([
    ctx.runQuery(internal.assets.listForTraderInternal, {
      traderId: traderId as never,
    }),
    ctx.runQuery(internal.marketNarratives.getLatestInternal, {}),
    ctx.runQuery(internal.systemPrompts.getActive, { name: "deal_outcome" }),
  ]);

  const inventoryDescription =
    (assets as Array<{ name: string; valueUsdc?: number }>).length === 0
      ? "empty — no assets"
      : (assets as Array<{ name: string; valueUsdc?: number }>)
          .map((a) => `${a.name} ($${a.valueUsdc ?? 0} USDC)`)
          .join(", ");

  // Max win value: MAX_EXTRACTION_PERCENTAGE % of pot
  const maxValuePerWin = deal.pot_usdc * (MAX_EXTRACTION_PERCENTAGE / 100);
  const randomSeed = Math.random();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const narrative = marketNarrative as Record<string, any> | null;
  const worldMood = narrative?.worldState?.mood ?? "tense";
  const secHeat = narrative?.worldState?.sec_heat ?? 5;
  const activeStorylines: string[] =
    narrative?.worldState?.active_storylines ?? [];

  const systemPrompt = systemPromptContent ?? FALLBACK_DEAL_OUTCOME_SYSTEM;

  const messages = [
    { role: "system" as const, content: systemPrompt },
    {
      role: "user" as const,
      content: `Resolve this deal for the trader and return the outcome as structured JSON.

DEAL: ${deal.prompt}

TRADER: ${traderName}
INVENTORY: ${inventoryDescription}
PORTFOLIO BALANCE: $${escrowBalanceUsdc} USDC
MAX WIN VALUE: $${maxValuePerWin.toFixed(2)} USDC (cannot exceed this)
RANDOM SEED: ${randomSeed.toFixed(2)} (use this to introduce randomness — lower values favor losses, higher values favor gains)

MARKET CONDITIONS:
- Market mood: ${worldMood}
- SEC heat level: ${secHeat}/10
- Active storylines: ${activeStorylines.length > 0 ? activeStorylines.join(", ") : "none"}

The market conditions should subtly influence outcomes. High SEC heat + insider trading = skew negative.
Euphoric mood + bull play = can skew positive. Use these as soft signals, not hard rules.

Rules:
- balance_change_usdc must be between -${escrowBalanceUsdc} and +${maxValuePerWin.toFixed(2)}
- If the trader loses everything, set trader_wiped_out to true and provide a wipeout_reason
- The narrative should be 2-3 short sentences only — vivid 1980s Wall Street tone, no rambling
- Each assets_gained[].name must be exactly 2-3 words (no parentheses, no subtitles); thematic items (tips, contacts, documents)
- assets_lost entries must copy inventory names exactly as listed in INVENTORY (required for matching)`,
    },
  ];

  // ── LLM call ───────────────────────────────────────────────────────────────
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const completion = await client.chat.completions.parse(
    {
      model: "gpt-4o-mini",
      messages,
      response_format: zodResponseFormat(DealOutcomeSchema, "deal_outcome"),
    },
    { timeout: 30_000 }
  );

  const msg = completion.choices[0]?.message;
  if (msg?.refusal) {
    throw new Error(`LLM refused to resolve outcome: ${msg.refusal}`);
  }
  if (!msg?.parsed) {
    throw new Error("LLM returned no parsed outcome");
  }

  const raw = msg.parsed as DealOutcomePayload;

  // ── Validate + clamp PnL ────────────────────────────────────────────────────
  // balance_change_usdc from LLM: clamp to [-balance, +maxValuePerWin]
  let balanceChange = raw.balance_change_usdc;
  balanceChange = Math.min(balanceChange, maxValuePerWin);
  balanceChange = Math.max(balanceChange, -escrowBalanceUsdc);

  // Apply rake on positive gains
  let traderPnlUsdc: number;
  if (balanceChange > 0) {
    const rake = balanceChange * (RAKE_PERCENTAGE / 100);
    traderPnlUsdc = balanceChange - rake;
  } else {
    traderPnlUsdc = balanceChange;
  }

  // If trader_wiped_out, force pnl to wipe out remaining balance
  const traderWipedOut = raw.trader_wiped_out;
  if (traderWipedOut) {
    traderPnlUsdc = -escrowBalanceUsdc;
  }

  return {
    payload: raw,
    traderPnlUsdc,
    traderWipedOut,
    wipeoutReason: raw.wipeout_reason ?? null,
    narrative: raw.narrative,
    assetsGained: raw.assets_gained,
    assetsLost: raw.assets_lost,
  };
}
