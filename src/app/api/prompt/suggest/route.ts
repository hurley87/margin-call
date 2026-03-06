import { NextRequest, NextResponse } from "next/server";
import { callModel } from "@/lib/llm/call-model";
import { buildPromptSuggestionMessages } from "@/lib/llm/messages";
import {
  DealPromptSuggestionsSchema,
  type DealPromptSuggestions,
} from "@/lib/llm/schemas";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { theme } = body as { theme?: string };

    if (!theme || typeof theme !== "string" || theme.trim().length === 0) {
      return NextResponse.json({ error: "theme is required" }, { status: 400 });
    }

    const messages = await buildPromptSuggestionMessages(theme.trim());
    const result = await callModel<DealPromptSuggestions>(
      messages as Awaited<typeof messages>,
      DealPromptSuggestionsSchema,
      "deal_prompt_suggestions"
    );

    return NextResponse.json({ suggestions: result.suggestions });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to generate suggestions";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
