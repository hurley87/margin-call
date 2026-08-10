type Listener = () => void;

const listeners = new Set<Listener>();

/**
 * Notifies every mounted balance consumer that on-chain wallet balances
 * changed, so sibling panels (faucet, LP Desk) re-read instead of going stale.
 */
export function notifyWalletBalancesChanged() {
  for (const listener of [...listeners]) listener();
}

export function subscribeToWalletBalanceChanges(
  listener: Listener
): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
