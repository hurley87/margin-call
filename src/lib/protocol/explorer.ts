/** Basescan transaction URL for a submitted hash. */
export function basescanTxUrl(hash: `0x${string}`): string {
  return `https://basescan.org/tx/${hash}`;
}
