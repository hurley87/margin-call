import type { CrashSettlementStatus } from "@/hooks/use-crash-ticket-settlement";
import { DISPLAY_ASSET_SYMBOL } from "@/lib/desk-dollars";

/** Shared settlement status line copy for Floor overlay and ticket settlement. */
export const settlementStatusCopy: Partial<
  Record<CrashSettlementStatus, string>
> = {
  loading: "Loading your ticket settlement state…",
  "reveal-submitting": "Submitting reveal request…",
  "reveal-pending": "Reveal pending until its Base Sepolia receipt succeeds…",
  attesting: "Fetching the covalidator attestation for your round…",
  "finalize-submitting": "Submitting finalization…",
  "finalize-pending":
    "Finalization pending until its Base Sepolia receipt succeeds…",
  "claim-submitting": "Submitting your claim…",
  "claim-pending": `Claim pending until its Base Sepolia receipt succeeds. ${DISPLAY_ASSET_SYMBOL} will not update until confirmation.`,
  "settle-submitting": "Submitting loss settlement…",
  "settle-pending":
    "Loss settlement pending until its Base Sepolia receipt succeeds…",
  confirmed: "Settlement confirmed on Base Sepolia.",
};
