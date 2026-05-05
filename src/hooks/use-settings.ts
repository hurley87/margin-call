"use client";

import { useCallback, useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { DeskManager } from "./use-desk";

interface UpdateSettingsInput {
  display_name?: string;
  settings?: Record<string, unknown>;
}

export function useUpdateSettings() {
  const upsert = useMutation(api.deskManagers.upsertMe);
  const [isPending, setPending] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const mutate = useCallback(
    async (input: UpdateSettingsInput) => {
      setPending(true);
      setError(null);
      try {
        await upsert({
          displayName: input.display_name,
          settings: input.settings,
        });
        // DeskManager row is reactive via getMe; return a minimal DeskManager for callers
        return {} as DeskManager;
      } catch (e) {
        const err = e instanceof Error ? e : new Error(String(e));
        setError(err);
        throw err;
      } finally {
        setPending(false);
      }
    },
    [upsert]
  );

  return {
    mutateAsync: mutate,
    isPending,
    isError: !!error,
    error,
  };
}
