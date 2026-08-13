import type {
  CrashSettlementRetryAction,
  CrashSettlementStatus,
} from "@/hooks/use-crash-ticket-settlement";
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

export const settlementRetryLabels: Record<CrashSettlementRetryAction, string> =
  {
    refresh: "Retry",
    verify: "Retry verify and settle",
    claim: "Retry claim",
    settle: "Retry settle loss",
    "reveal-receipt-check": "Retry reveal receipt check",
    "finalize-receipt-check": "Retry finalization receipt check",
    "claim-receipt-check": "Retry claim receipt check",
    "settle-receipt-check": "Retry settle receipt check",
  };
