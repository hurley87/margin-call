"use client";

import { useMutation, useQuery } from "convex/react";
import { useCallback, useState } from "react";
import { api } from "../../../convex/_generated/api";

type DeskPhoneSwitchProps = {
  walletAddress: `0x${string}`;
};

/**
 * Compact Desk phone switch for signed-in chrome.
 * Default off; flipping off stops further liquidation calls.
 */
export function DeskPhoneSwitch({ walletAddress }: DeskPhoneSwitchProps) {
  const consent = useQuery(api.marginCall.myMarginCallConsent);
  const setConsent = useMutation(api.marginCall.setMarginCallConsent);
  const optedIn = consent?.optedIn === true;
  const isReady = consent !== undefined;
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);

  const toggle = useCallback(async () => {
    if (!isReady || pending) return;
    setPending(true);
    setError(false);
    try {
      await setConsent({ optedIn: !optedIn, walletAddress });
    } catch {
      setError(true);
    } finally {
      setPending(false);
    }
  }, [isReady, optedIn, pending, setConsent, walletAddress]);

  return (
    <div
      className="flex flex-col items-end gap-0.5"
      data-testid="desk-phone-switch"
    >
      <button
        aria-describedby="desk-phone-hint"
        aria-pressed={optedIn}
        className={`border px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.16em] transition-colors duration-[var(--mc-dur-fast)] ${
          optedIn
            ? "border-[var(--t-accent)] text-[var(--t-accent)]"
            : "border-[var(--t-border)] text-[var(--t-muted)] hover:border-[var(--t-accent)] hover:text-[var(--t-accent)]"
        } ${pending || !isReady ? "opacity-60" : ""}`}
        disabled={!isReady || pending}
        onClick={() => void toggle()}
        title="The desk calls your login number after a margin call"
        type="button"
      >
        Desk phone · {optedIn ? "On" : "Off"}
      </button>
      <p
        className="max-w-[14rem] text-right text-[9px] leading-3 text-[var(--t-muted)]"
        id="desk-phone-hint"
      >
        {error
          ? "Couldn’t update. Try again."
          : "Calls your login number after a margin call."}
      </p>
    </div>
  );
}
