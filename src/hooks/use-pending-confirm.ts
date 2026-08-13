"use client";

import { useCallback, useState } from "react";

/**
 * Shared arm → confirm → clear lifecycle for high-stakes sponsored actions.
 * Callers keep form field state; this only holds the armed payload.
 */
export function usePendingConfirm<T>() {
  const [pending, setPending] = useState<T | null>(null);

  const arm = useCallback((value: T) => {
    setPending(value);
  }, []);

  const cancel = useCallback(() => {
    setPending(null);
  }, []);

  const confirm = useCallback(
    (run: (value: T) => Promise<unknown> | unknown) => {
      if (pending === null) return;
      const value = pending;
      void (async () => {
        try {
          await run(value);
        } finally {
          setPending(null);
        }
      })();
    },
    [pending]
  );

  return { pending, arm, cancel, confirm };
}
