"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  getMarginCallCrashConfig,
  type MarginCallCrashConfig,
} from "@/lib/margin-call-crash";

const POLL_INTERVAL_MS = 10_000;

export const historyConfigurationError =
  "Crash history reads are not configured for this Base Sepolia deployment.";

export type PolledCrashReadStatus =
  "loading" | "ready" | "error" | "unavailable";

/** Serializes render-relevant data so equal polls can keep the previous reference. */
function stableKey(value: unknown): string {
  return JSON.stringify(value, (_key, item) =>
    typeof item === "bigint" ? item.toString() : item
  );
}

/**
 * Polls a Crash chain read every 10 seconds with single-flight and config
 * guards. Pass `read: null` while the reader's inputs (e.g. a wallet) are not
 * ready; unchanged results keep their previous reference so consumers only
 * re-render when the data actually moved.
 */
export function usePolledCrashRead<T>(
  read: ((config: MarginCallCrashConfig) => Promise<T>) | null
): {
  config: MarginCallCrashConfig | null;
  data: T | null;
  status: PolledCrashReadStatus;
  refresh: () => Promise<void>;
} {
  const config = useMemo(() => getMarginCallCrashConfig(), []);
  const [data, setData] = useState<T | null>(null);
  const [status, setStatus] = useState<PolledCrashReadStatus>("loading");
  const inFlight = useRef(false);

  const refresh = useCallback(async () => {
    if (!config || !read || inFlight.current) return;
    inFlight.current = true;
    try {
      const next = await read(config);
      setData((previous) =>
        previous !== null && stableKey(previous) === stableKey(next)
          ? previous
          : next
      );
      setStatus("ready");
    } catch {
      setStatus("error");
    } finally {
      inFlight.current = false;
    }
  }, [config, read]);

  useEffect(() => {
    if (!config) {
      setStatus("unavailable");
      return;
    }
    if (!read) {
      setData(null);
      setStatus("loading");
      return;
    }
    void refresh();
    const poll = window.setInterval(() => void refresh(), POLL_INTERVAL_MS);
    return () => window.clearInterval(poll);
  }, [config, read, refresh]);

  return { config, data, status, refresh };
}
