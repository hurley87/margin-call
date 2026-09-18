import { basescanTxUrl } from "@/lib/protocol/explorer";
import type { TxPhase } from "@/lib/protocol/tx-phase";
import { formatShortAddress } from "@/lib/utils";

/** Shared wallet-write status line for every Base write surface. */
export function TxStatus({ phase }: { phase: TxPhase }) {
  switch (phase.status) {
    case "idle":
      return null;
    case "awaiting-signature":
      return (
        <p className="text-xs text-[var(--t-muted)]">
          Awaiting wallet signature… ({phase.label})
        </p>
      );
    case "submitted":
    case "confirmed":
      return (
        <p className="text-xs text-[var(--t-muted)]">
          {phase.status === "submitted" ? "Submitted" : "Confirmed"}:{" "}
          <a
            className="text-[var(--t-accent)] underline"
            href={basescanTxUrl(phase.hash)}
            target="_blank"
            rel="noreferrer"
          >
            {formatShortAddress(phase.hash)}
          </a>{" "}
          ({phase.label})
        </p>
      );
    case "error":
      return (
        <p className="text-xs text-[var(--t-red)]">
          {phase.label}: {phase.message}
          {phase.hash ? (
            <>
              {" "}
              <a
                className="underline"
                href={basescanTxUrl(phase.hash)}
                target="_blank"
                rel="noreferrer"
              >
                {formatShortAddress(phase.hash)}
              </a>
            </>
          ) : null}
        </p>
      );
    default: {
      const _exhaustive: never = phase;
      return _exhaustive;
    }
  }
}
