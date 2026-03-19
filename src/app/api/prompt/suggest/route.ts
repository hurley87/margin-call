import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { buildPromptSuggestionMessages } from "@/lib/llm/messages";
import {
  promptSuggestLimit,
  checkRateLimit,
  getClientIdentifier,
} from "@/lib/rate-limit";
import { verifyPrivyToken } from "@/lib/privy/server";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function POST(request: NextRequest) {
  try {
    // Require auth to protect OpenAI spend
    await verifyPrivyToken(request);

    const body = await request.json();
    const { theme } = body as { theme?: string };

    if (!theme || typeof theme !== "string" || theme.trim().length === 0) {
      return NextResponse.json({ error: "theme is required" }, { status: 400 });
    }

    // Rate limit: 5 req/min per client (protects OpenAI costs)
    const rlKey = getClientIdentifier(request);
    const limited = await checkRateLimit(promptSuggestLimit, rlKey);
    if (limited) return limited;

    const messages = await buildPromptSuggestionMessages(theme.trim());

    // Use json_object mode instead of zodResponseFormat — much faster
    // for a simple { suggestions: string[] } response
    const completion = await client.chat.completions.create(
      {
        model: "gpt-4o-mini",
        messages: [
          ...messages,
          {
            role: "user",
            content:
              'Respond with a JSON object: {"suggestions": ["suggestion1", "suggestion2", "suggestion3"]}',
          },
        ],
        response_format: { type: "json_object" },
      },
      { timeout: 15_000 }
    );

    const raw = completion.choices[0]?.message?.content;
    if (!raw) {
      return NextResponse.json(
        { error: "No response from model" },
        { status: 500 }
      );
    }

    const parsed = JSON.parse(raw);
    const suggestions = parsed.suggestions;

    if (!Array.isArray(suggestions) || suggestions.length < 3) {
      return NextResponse.json(
        { error: "Invalid suggestions format" },
        { status: 500 }
      );
    }

    return NextResponse.json({ suggestions: suggestions.slice(0, 3) });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to generate suggestions";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
