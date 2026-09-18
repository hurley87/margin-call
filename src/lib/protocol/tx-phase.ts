export type TxPhase =
  | { status: "idle" }
  | { status: "awaiting-signature"; label: string }
  | { status: "submitted"; label: string; hash: `0x${string}` }
  | { status: "confirmed"; label: string; hash: `0x${string}` }
  | { status: "error"; label: string; message: string; hash?: `0x${string}` };

export function isTxPending(phase: TxPhase): boolean {
  return phase.status === "awaiting-signature" || phase.status === "submitted";
}
