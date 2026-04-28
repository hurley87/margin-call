import OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";

const MODEL = "gpt-5-mini";
const TIMEOUT_MS = 30_000;

export class LLMError extends Error {
  constructor(
    message: string,
    public readonly code: string
  ) {
    super(message);
    this.name = "LLMError";
  }
}

export async function callModel<T>(
  messages: ChatCompletionMessageParam[],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  schema: any,
  schemaName: string
): Promise<T> {
  // Initialise lazily so the module evaluates without OPENAI_API_KEY at build time.
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  try {
    const completion = await client.chat.completions.parse(
      {
        model: MODEL,
        messages,
        response_format: zodResponseFormat(schema, schemaName),
      },
      { timeout: TIMEOUT_MS }
    );

    const message = completion.choices[0]?.message;

    if (message?.refusal) {
      throw new LLMError(`Model refused: ${message.refusal}`, "model_refusal");
    }

    if (!message?.parsed) {
      throw new LLMError("No parsed response from model", "empty_response");
    }

    return message.parsed;
  } catch (error) {
    if (error instanceof LLMError) throw error;

    if (error instanceof OpenAI.APIError) {
      if (error.status === 429) {
        throw new LLMError("Rate limited by OpenAI", "rate_limit");
      }
      throw new LLMError(`OpenAI API error: ${error.message}`, "api_error");
    }

    if (
      error instanceof Error &&
      error.message.toLowerCase().includes("timeout")
    ) {
      throw new LLMError("OpenAI request timed out", "timeout");
    }

    throw new LLMError(
      `Unexpected error: ${error instanceof Error ? error.message : String(error)}`,
      "unknown"
    );
  }
}
