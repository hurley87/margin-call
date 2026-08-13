import type { CrashEntryStatus } from "@/hooks/use-crash-round-entry";

/** Primary enter CTA label from entry status and approval need. */
export function entrySubmitLabel(
  status: CrashEntryStatus,
  needsApproval: boolean
): string {
  if (status === "approval-submitting" || status === "approval-pending") {
    return "Approval pending…";
  }
  if (status === "entry-submitting" || status === "entry-pending") {
    return "Entering…";
  }
  return needsApproval ? "Approve & enter" : "Enter round";
}
