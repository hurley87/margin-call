"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";

interface UpdateSettingsInput {
  display_name?: string;
  settings?: Record<string, unknown>;
}

/**
 * Update desk manager display name / settings via Convex mutation.
 */
export function useUpdateSettings() {
  const upsert = useMutation(api.deskManagers.upsertMe);
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  async function mutate(input: UpdateSettingsInput) {
    setIsPending(true);
    setError(null);
    try {
      await upsert({
        displayName: input.display_name,
        settings: input.settings,
      });
    } catch (err) {
      setError(
        err instanceof Error ? err : new Error("Failed to update settings")
      );
    } finally {
      setIsPending(false);
    }
  }

  return { mutate, isPending, error };
}
