/**
 * On-chain settlement reconciliation can leave a sentinel value in the
 * `onChainTxHash` column when no real transaction was sent (e.g. the chain
 * was already settled through a different path). Sentinels start with
 * `reconciled:` — they're useful in DB queries but must not leak into UI
 * basescan links or anything that expects a 0x-prefixed hex hash.
 */
export function isRealTxHash(value: string | null | undefined): boolean {
  return typeof value === "string" && value.startsWith("0x");
}

export function realTxHashOrNull(
  value: string | null | undefined
): string | undefined {
  return isRealTxHash(value) ? (value as string) : undefined;
}
