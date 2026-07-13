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
import type { Id } from "../_generated/dataModel";
import type { RunActionCtx } from "./_ctx";
import { internal } from "../_generated/api";
import {
  RAKE_PERCENTAGE,
  BASE_WIN_PROBABILITY,
  WIN_PROB_MARKET_SWING,
  MIN_WIN_PROBABILITY,
  MAX_WIN_PROBABILITY,
  WIN_MAGNITUDE_MIN_FRACTION,
  WIN_MAGNITUDE_MAX_FRACTION,
  LOSS_MAGNITUDE_MIN_FRACTION,
  LOSS_MAGNITUDE_MAX_FRACTION,
} from "./_constants";
import { maxWinValueUsdc } from "../lib/extractionCap";
import { DealOutcomeSchema, type DealOutcomePayload } from "./_schemas";
import type { Deal } from "./_types";

const FALLBACK_DEAL_OUTCOME_SYSTEM = `You are the narrator for a 1980s Wall Street trading game.
The win/loss outcome has already been decided by the house — you only dramatize it with vivid, terse prose and structured data.
Make wins feel earned and losses feel brutal, but never contradict the decided outcome.
Always return valid JSON matching the schema. Keep narrative to 2-3 short sentences.`;

export interface OutcomeResolverInput {
  deal: Deal;
  traderId: Id<"traders">;
  traderName: string;
  escrowBalanceUsdc: number;
  entryCostUsdc: number;
}

export interface ResolvedOutcome {
  /** Raw LLM output */
  payload: DealOutcomePayload;
  /** Validated PnL (clamped to balance and max extraction) */
  traderPnlUsdc: number;
  /** Platform rake on gross positive winnings. */
  rakeUsdc: number;
  /** Delta applied to the deal pot. Positive means the pot grew. */
  potChangeUsdc: number;
  /** True if the trader is wiped out */
  traderWipedOut: boolean;
  wipeoutReason: string | null;
  narrative: string;
  assetsGained: Array<{ name: string; value_usdc: number }>;
  assetsLost: string[];
}

const lerp = (min: number, max: number, t: number) => min + (max - min) * t;

/**
 * Compute the win probability for a deal from market signals. Starts at the
 * baseline and shifts by up to ±WIN_PROB_MARKET_SWING based on mood and SEC
 * heat, then clamps to [MIN_WIN_PROBABILITY, MAX_WIN_PROBABILITY].
 */
function computeWinProbability(worldMood: string, secHeat: number): number {
  let shift = 0;
  const mood = worldMood.toLowerCase();
  if (/eupho|bull|greed|boom|frenzy|rally/.test(mood)) {
    shift += WIN_PROB_MARKET_SWING;
  } else if (/pani|bear|crash|fear|gloom|doom|collapse/.test(mood)) {
    shift -= WIN_PROB_MARKET_SWING;
  }
  // SEC heat 0..10 → up to a full negative swing at max heat.
  const heat = Math.max(0, Math.min(10, secHeat));
  shift -= (heat / 10) * WIN_PROB_MARKET_SWING;

  const p = BASE_WIN_PROBABILITY + shift;
  return Math.max(MIN_WIN_PROBABILITY, Math.min(MAX_WIN_PROBABILITY, p));
}

/**
 * Resolve a deal outcome by calling the LLM.
 *
 * The win/loss decision AND magnitude are made mechanically in code — the LLM
 * only narrates the pre-decided result. If the LLM fails, throws — the caller
 * should release the cycle lease and log the error so the next cycle retries.
 */
export async function resolveOutcome(
  ctx: RunActionCtx,
  input: OutcomeResolverInput
): Promise<ResolvedOutcome> {
  const { deal, traderId, traderName, escrowBalanceUsdc, entryCostUsdc } =
    input;

  // ── Load context (assets + market narrative + system prompt) ───────────────
  const [assets, marketNarrative, systemPromptContent] = await Promise.all([
    ctx.runQuery(internal.assets.listForTraderInternal, {
      traderId,
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

  // Max win profit: creation-frozen extraction cap (required; never live pot).
  const maxValuePerWin = maxWinValueUsdc(deal);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const narrative = marketNarrative as Record<string, any> | null;
  const worldMood = narrative?.worldState?.mood ?? "tense";
  const secHeat = narrative?.worldState?.sec_heat ?? 5;
  const activeStorylines: string[] =
    narrative?.worldState?.active_storylines ?? [];

  // ── Decide the outcome mechanically (NOT via the LLM) ──────────────────────
  // The LLM cannot reliably sample from a "random seed", so win/loss and its
  // magnitude are rolled here with a real, market-modulated probability. The
  // LLM is handed the result and only narrates it.
  //
  // Both win and loss are sized off the trader's entry cost (stake). Because
  // average loss > average win (see _constants.ts), the deal carries a house
  // edge: the pot trends up (the creator's incentive) and a baseline trader is
  // slightly net-negative. maxValuePerWin remains only as a safety clamp below.
  const winProbability = computeWinProbability(worldMood, secHeat);
  const isWin = Math.random() < winProbability;
  const decidedBalanceChange = isWin
    ? entryCostUsdc *
      lerp(
        WIN_MAGNITUDE_MIN_FRACTION,
        WIN_MAGNITUDE_MAX_FRACTION,
        Math.random()
      )
    : -entryCostUsdc *
      lerp(
        LOSS_MAGNITUDE_MIN_FRACTION,
        LOSS_MAGNITUDE_MAX_FRACTION,
        Math.random()
      );
  const outcomeLabel = isWin
    ? `WIN of $${decidedBalanceChange.toFixed(2)} USDC`
    : `LOSS of $${Math.abs(decidedBalanceChange).toFixed(2)} USDC`;

  const systemPrompt = systemPromptContent ?? FALLBACK_DEAL_OUTCOME_SYSTEM;

  const messages = [
    { role: "system" as const, content: systemPrompt },
    {
      role: "user" as const,
      content: `Narrate the outcome of this deal and return it as structured JSON.

The outcome has ALREADY been decided by the house. Your job is to dramatize it,
not to change it.

DEAL: ${deal.prompt}

TRADER: ${traderName}
INVENTORY: ${inventoryDescription}
PORTFOLIO BALANCE: $${escrowBalanceUsdc} USDC

DECIDED OUTCOME: ${outcomeLabel}
- The narrative MUST match this outcome: a WIN must read as a clear win, a LOSS must read as a clear loss. Never contradict the decided result.

MARKET CONDITIONS (color for the narrative only — do NOT change the outcome):
- Market mood: ${worldMood}
- SEC heat level: ${secHeat}/10
- Active storylines: ${activeStorylines.length > 0 ? activeStorylines.join(", ") : "none"}

Rules:
- trader_wiped_out is advisory only; final wipeout is derived mechanically after PnL is applied
- The narrative should be 2-3 short sentences only — vivid 1980s Wall Street tone, no rambling
- Each assets_gained[].name must be exactly 2-3 words (no parentheses, no subtitles); thematic items (tips, contacts, documents). On a LOSS, assets_gained should normally be empty.
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
  // PnL is the code-decided value, NOT the LLM's — the LLM only narrates.
  // Clamp to [-entry cost, +maxValuePerWin] as a safety net.
  let balanceChange = decidedBalanceChange;
  balanceChange = Math.min(balanceChange, maxValuePerWin);
  balanceChange = Math.max(balanceChange, -entryCostUsdc);

  // Apply rake on positive gains
  let traderPnlUsdc: number;
  let rakeUsdc = 0;
  if (balanceChange > 0) {
    rakeUsdc = balanceChange * (RAKE_PERCENTAGE / 100);
    traderPnlUsdc = balanceChange - rakeUsdc;
  } else {
    traderPnlUsdc = balanceChange;
  }
  const potChangeUsdc =
    balanceChange > 0 ? -balanceChange : Math.abs(balanceChange);

  const endingBalance = escrowBalanceUsdc + traderPnlUsdc;
  const traderWipedOut = endingBalance <= 0;

  return {
    payload: raw,
    traderPnlUsdc,
    rakeUsdc,
    potChangeUsdc,
    traderWipedOut,
    wipeoutReason: traderWipedOut
      ? (raw.wipeout_reason ?? "margin_call")
      : null,
    narrative: raw.narrative,
    assetsGained: raw.assets_gained,
    assetsLost: raw.assets_lost,
  };
}
