import { formatStatus } from "@/lib/format-status";
import type { PublicPortraitTraits } from "@/lib/trader-metadata";

export type PublicTraderProfile = {
  traderId: string;
  name: string;
  status: "active" | "paused" | "wiped_out";
  tokenId: number | null;
  portraitStatus: "pending" | "generating" | "ready" | "error";
  archetype: string;
  riskProfile: string;
  traits: PublicPortraitTraits | null;
  escrowBalanceUsdc: number;
  profileImageUrl: string | null;
  ownerAddress?: string | null;
  isAgentDesk?: boolean;
  recentActivity: Array<{
    activityType: string;
    message: string;
    dealId: string | null;
    createdAt: number;
  }>;
};

export function getStatusTone(status: PublicTraderProfile["status"]): string {
  if (status === "active") return "text-[var(--t-green)]";
  if (status === "wiped_out") return "text-[var(--t-red)]";
  return "text-[var(--t-amber)]";
}

export function getPortraitTone(
  status: PublicTraderProfile["portraitStatus"]
): string {
  if (status === "ready") return "text-[var(--t-green)]";
  if (status === "error") return "text-[var(--t-red)]";
  return "text-[var(--t-amber)]";
}

export function getEscrowTone(balanceUsdc: number): string {
  return balanceUsdc > 0 ? "text-[var(--t-green)]" : "text-[var(--t-amber)]";
}

export function formatPortraitStatus(
  status: PublicTraderProfile["portraitStatus"]
): string {
  if (status === "error") return "Fallback";
  return formatStatus(status);
}

export function tokenLabel(tokenId: number | null): string {
  return tokenId === null ? "Pending" : `#${tokenId}`;
}
