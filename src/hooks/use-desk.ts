import { useQuery } from "@tanstack/react-query";
import { usePrivy } from "@privy-io/react-auth";
import { authFetch } from "@/lib/api";

export interface DeskManager {
  id: string;
  wallet_address: string;
  display_name: string;
  settings: Record<string, unknown>;
  created_at: string;
}

export function useDeskManager() {
  const { authenticated } = usePrivy();

  return useQuery({
    queryKey: ["desk", "register"],
    queryFn: async () => {
      const res = await authFetch("/api/desk/register", { method: "POST" });
      if (!res.ok) throw new Error("Failed to register desk manager");
      const { deskManager } = await res.json();
      return deskManager as DeskManager;
    },
    enabled: authenticated,
  });
}
