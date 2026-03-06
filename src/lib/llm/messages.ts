import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { getActiveSystemPrompt } from "@/lib/supabase/queries";

interface DealResolutionParams {
  dealPrompt: string;
  traderName: string;
  traderInventory: { name: string; value_usdc: number }[];
  portfolioBalance: number;
  maxValuePerWin: number;
  randomSeed: number;
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

Rules:
- balance_change_usdc must be between -${params.portfolioBalance} and +${params.maxValuePerWin}
- If the trader loses everything, set trader_wiped_out to true and provide a wipeout_reason
- The narrative should be an array of 2-5 dramatic story events describing what happened
- Assets gained should be thematic Wall Street items (insider tips, contacts, documents, etc.)
- Assets lost must reference items from the trader's current inventory by name`,
    },
  ];
}

interface CorrectionParams {
  originalNarrative: { event: string; description: string }[];
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
${params.originalNarrative.map((e) => `- ${e.event}: ${e.description}`).join("\n")}

ORIGINAL BALANCE CHANGE: $${params.originalBalanceChange} USDC
CORRECTED BALANCE CHANGE: $${params.correctedBalanceChange} USDC

Return the corrected narrative as an array of story events with the same structure.`,
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
