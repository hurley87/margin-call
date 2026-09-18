const TX_HASH_RE = /^0x[a-fA-F0-9]{64}$/;

/** Narrow an indexed/stored string to a transaction hash, or null when it is not one. */
export function parseTxHash(
  value: string | null | undefined
): `0x${string}` | null {
  if (value == null || !TX_HASH_RE.test(value)) return null;
  return value as `0x${string}`;
}

/** Basescan transaction URL for a submitted hash. */
export function basescanTxUrl(hash: `0x${string}`): string {
  return `https://basescan.org/tx/${hash}`;
}
