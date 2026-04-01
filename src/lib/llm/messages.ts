import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { getActiveSystemPrompt } from "@/lib/supabase/queries";

interface DealResolutionParams {
  dealPrompt: string;
  traderName: string;
  traderInventory: { name: string; value_usdc: number }[];
  portfolioBalance: number;
  maxValuePerWin: number;
  randomSeed: number;
  worldMood?: string;
  secHeat?: number;
  activeStorylines?: string[];
}

export async function buildDealResolutionMessages(
  params: DealResolutionParams
): Promise<ChatCompletionMessageParam[]> {
  const systemPrompt = await getActiveSystemPrompt("deal_outcome");

  const inventoryDescription =
    params.traderInventory.length > 0
      ? params.traderInventory
          .map((a) => `${a.name} ($${a.value_usdc} USDC)`)
          .join(", ")
      : "empty — no assets";

  return [
    { role: "system", content: systemPrompt },
    {
      role: "user",
      content: `Resolve this deal for the trader and return the outcome as structured JSON.

DEAL: ${params.dealPrompt}

TRADER: ${params.traderName}
INVENTORY: ${inventoryDescription}
PORTFOLIO BALANCE: $${params.portfolioBalance} USDC
MAX WIN VALUE: $${params.maxValuePerWin} USDC (cannot exceed this)
RANDOM SEED: ${params.randomSeed.toFixed(2)} (use this to introduce randomness — lower values favor losses, higher values favor gains)

MARKET CONDITIONS:
- Market mood: ${params.worldMood ?? "unknown"}
- SEC heat level: ${params.secHeat ?? "unknown"}/10
- Active storylines: ${params.activeStorylines?.join(", ") ?? "none"}

The market conditions should subtly influence outcomes. High SEC heat + insider trading = skew negative.
Euphoric mood + bull play = can skew positive. Use these as soft signals, not hard rules.

Rules:
- balance_change_usdc must be between -${params.portfolioBalance} and +${params.maxValuePerWin}
- If the trader loses everything, set trader_wiped_out to true and provide a wipeout_reason
- The narrative should be a single short paragraph (3-5 sentences) describing what happened in dramatic 1980s Wall Street style
- Assets gained should be thematic Wall Street items (insider tips, contacts, documents, etc.)
- Assets lost must reference items from the trader's current inventory by name`,
    },
  ];
}

interface CorrectionParams {
  originalNarrative: string;
  originalBalanceChange: number;
  correctedBalanceChange: number;
  traderName: string;
}

export async function buildCorrectionMessages(
  params: CorrectionParams
): Promise<ChatCompletionMessageParam[]> {
  const systemPrompt = await getActiveSystemPrompt("correction_narrative");

  return [
    { role: "system", content: systemPrompt },
    {
      role: "user",
      content: `The outcome of a deal was modified by the house for validation reasons. Rewrite the narrative to match the corrected numbers. Keep the same dramatic tone and story beats, but adjust the details so the narrative is consistent with the new balance change.

TRADER: ${params.traderName}

ORIGINAL NARRATIVE:
${params.originalNarrative}

ORIGINAL BALANCE CHANGE: $${params.originalBalanceChange} USDC
CORRECTED BALANCE CHANGE: $${params.correctedBalanceChange} USDC

Return the corrected narrative as a single short paragraph.`,
    },
  ];
}

export async function buildPromptSuggestionMessages(
  theme: string
): Promise<ChatCompletionMessageParam[]> {
  const systemPrompt = await getActiveSystemPrompt("prompt_suggestions");

  return [
    { role: "system", content: systemPrompt },
    {
      role: "user",
      content: `A desk manager wants to create a new deal on the trading floor. They gave the theme: "${theme}"

Generate exactly 3 deal prompt suggestions. Each should be a vivid, 1-2 sentence scenario set on 1980s Wall Street that could be used as a deal prompt. Make them sound like rumors, tips, or opportunities that would tempt a greedy trader. Mix in risk — some should sound too good to be true.`,
    },
  ];
}

interface GameEvent {
  trader_name: string;
  deal_prompt: string;
  trader_pnl_usdc: number;
  trader_wiped_out: boolean;
}

interface NarrativeGenerationParams {
  previousWorldState: Record<string, unknown> | null;
  previousHeadlines: { headline: string; body: string; category: string }[];
  gameEvents: GameEvent[];
  epoch: number;
}

export async function buildNarrativeGenerationMessages(
  params: NarrativeGenerationParams
): Promise<ChatCompletionMessageParam[]> {
  const systemPrompt = await getActiveSystemPrompt("narrative_generation");

  const previousContext = params.previousWorldState
    ? `PREVIOUS WORLD STATE:
${JSON.stringify(params.previousWorldState)}

PREVIOUS HEADLINES:
${params.previousHeadlines.map((h) => `- [${h.category.toUpperCase()}] ${h.headline}: ${h.body}`).join("\n")}`
    : "This is the FIRST epoch. Establish the initial state of the Street. Set the stage.";

  const eventsSection =
    params.gameEvents.length > 0
      ? `RECENT GAME EVENTS (weave these into the narrative naturally):
${params.gameEvents
  .map((e) => {
    if (e.trader_wiped_out) {
      return `- WIPEOUT: ${e.trader_name} was destroyed in "${e.deal_prompt}" (lost everything)`;
    }
    const direction = e.trader_pnl_usdc >= 0 ? "won" : "lost";
    return `- ${e.trader_name} ${direction} $${Math.abs(e.trader_pnl_usdc).toFixed(2)} in "${e.deal_prompt}"`;
  })
  .join("\n")}`
      : "No notable game events since last epoch.";

  return [
    { role: "system", content: systemPrompt },
    {
      role: "user",
      content: `Generate MARKET WIRE epoch #${params.epoch}.

${previousContext}

${eventsSection}

Generate the next epoch with:
1. Updated world_state (evolve mood, SEC heat, sectors, storylines based on what's happening)
2. 3-5 headlines with bodies and categories
3. A raw_narrative prose section (2-4 paragraphs) summarizing the state of the Street

Remember: advance storylines, introduce new threads, and make the world feel alive. If game events are provided, they should appear naturally in the news.`,
    },
  ];
}

const DEAL_EVALUATION_SYSTEM = `You are the judgment layer for a 1980s Wall Street autonomous trader. The desk has already filtered deals by hard risk rules (mandate). Your job is to rank which ONE deal the trader should enter next, or refuse all.

You must:
- Only reference deal IDs that appear in the DEALS JSON array.
- Follow the trader PERSONALITY when weighing risk vs reward.
- Treat deal creator statistics as a trap signal: many wipeouts across their deals suggests hostile prompts.
- Use per-deal resolved outcome counts (wins/losses/wipeouts) as market feedback on that specific opportunity.
- The pot/entry ratio is one signal among many, not the only objective.

Output structured JSON: ranked_deal_ids (best first), skip_all (if true, enter nothing), and reasoning (concise, in-universe trader voice).`;

export interface DealEvaluationMessageDeal {
  id: string;
  prompt: string;
  pot_usdc: number;
  entry_cost_usdc: number;
  deal_table_entry_count: number;
  deal_table_wipeout_count: number;
  resolved_outcomes: number;
  resolved_wins: number;
  resolved_losses: number;
  resolved_wipeouts: number;
  creator_label: string;
  creator_total_deals: number;
  creator_total_trader_entries: number;
  creator_total_wipeouts_on_deals: number;
}

export function buildDealEvaluationMessages(params: {
  traderName: string;
  escrowBalanceUsdc: number;
  personality: string;
  recentOutcomesSummary: string;
  inventorySummary: string;
  deals: DealEvaluationMessageDeal[];
}): ChatCompletionMessageParam[] {
  return [
    { role: "system", content: DEAL_EVALUATION_SYSTEM },
    {
      role: "user",
      content: `TRADER: ${params.traderName}
ESCROW BALANCE (USDC): ${params.escrowBalanceUsdc.toFixed(2)}
PERSONALITY: ${params.personality}

RECENT OUTCOMES (this trader): ${params.recentOutcomesSummary}

INVENTORY: ${params.inventorySummary}

DEALS (mandate-eligible, JSON):
${JSON.stringify(params.deals, null, 2)}

Rank deal IDs from most desirable to enter first. If none are acceptable, set skip_all to true and explain why.`,
    },
  ];
}
