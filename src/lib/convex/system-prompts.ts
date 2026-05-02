import "server-only";

import { createConvexAdminClient } from "./server-client";
import { internal } from "../../../convex/_generated/api";

/**
 * Fetch the content of an active system prompt by name from Convex.
 * Throws if no active prompt with that name is found.
 */
export async function getActiveSystemPrompt(name: string): Promise<string> {
  const convex = createConvexAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const content = (await (convex as any).query(
    internal.systemPrompts.getActive,
    {
      name,
    }
  )) as string | null;

  if (!content) {
    throw new Error(`System prompt "${name}" not found or inactive`);
  }
  return content;
}
