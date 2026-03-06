import { useMutation, useQueryClient } from "@tanstack/react-query";
import { authFetch } from "@/lib/api";
import type { DeskManager } from "./use-desk";

interface UpdateSettingsInput {
  display_name?: string;
  settings?: Record<string, unknown>;
}

export function useUpdateSettings() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: UpdateSettingsInput) => {
      const res = await authFetch("/api/desk/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update settings");
      return data.deskManager as DeskManager;
    },
    onSuccess: (deskManager) => {
      queryClient.setQueryData(["desk", "register"], deskManager);
    },
  });
}
