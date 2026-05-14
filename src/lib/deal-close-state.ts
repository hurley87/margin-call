export type CloseDealPhase =
  | "idle"
  | "wallet"
  | "confirming"
  | "syncing"
  | "done"
  | "error";

export function closeDealButtonLabel(
  phase: CloseDealPhase,
  isOnChainClosed = false
) {
  if (phase === "wallet") return "CONFIRM IN WALLET...";
  if (phase === "confirming") return "CLOSING...";
  if (phase === "syncing") return "SYNCING...";
  if (phase === "error" && isOnChainClosed) return "RETRY SYNC";
  if (isOnChainClosed) return "SYNC CLOSED DEAL";
  return "CLOSE DEAL";
}

export function isCloseDealBusy(phase: CloseDealPhase) {
  return phase === "wallet" || phase === "confirming" || phase === "syncing";
}

export function closeDealErrorMessage(error: unknown) {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }
  if (typeof error === "string" && error.trim().length > 0) {
    return error;
  }
  return "Failed to close deal";
}
