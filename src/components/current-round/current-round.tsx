"use client";

import {
  useCurrentCrashRound,
  type CurrentCrashRoundView,
} from "@/hooks/use-current-crash-round";
import { isPreLockPhase, type CrashRoundPhase } from "@/lib/margin-call-crash";
import { roundPhaseCopy } from "@/lib/round-phase-copy";
import type { RoundTimeline } from "@/lib/round-timeline";
import { formatCountdown, TERMINAL_ACTION_BUTTON_CLASS } from "@/lib/utils";
import { CrashRoundEntry } from "./crash-round-entry";

type ReadyRound = Extract<CurrentCrashRoundView, { status: "ready" }>;

const phaseColors: Record<CrashRoundPhase, string> = {
  prelaunch: "text-[var(--t-blue)] border-[var(--t-blue)]/50",
  uninitialized: "text-[var(--t-muted)] border-[var(--t-muted)]/40",
  open: "text-[var(--t-green-hot)] border-[var(--t-green)]/50",
  locked: "text-[var(--t-amber-hot)] border-[var(--t-amber)]/50",
  "reveal-requested": "text-[var(--t-blue)] border-[var(--t-blue)]/50",
  "expired-eligible": "text-[var(--t-red-hot)] border-[var(--t-red)]/50",
  finalized: "text-[var(--t-green)] border-[var(--t-green)]/40",
  expired: "text-[var(--t-muted)] border-[var(--t-muted)]/40",
};

/**
 * Action rail for the current round: phase, entry, compact verification.
 * Countdown and Crash Point live on the Round Theater chart.
 */
export function CurrentRound() {
  const round = useCurrentCrashRound();

  if (round.status === "loading") return <CurrentRoundLoading />;
  if (round.status !== "ready") return <CurrentRoundFailure round={round} />;

  const phase = round.phase;
  return (
    <section
      aria-labelledby="current-round-heading"
      className="border border-[var(--t-border)] bg-[var(--t-panel)] text-left"
      data-testid="current-round"
    >
      <div className="px-4 py-5 sm:px-5">
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-[var(--t-type-label)] font-bold uppercase tracking-[0.24em] text-[var(--t-muted)]">
            Current round
          </p>
          <span
            className={`inline-flex items-center gap-1.5 border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em] ${phaseColors[phase]}`}
          >
            {phase === "open" ? (
              <span
                aria-hidden="true"
                className="live-pulse h-1.5 w-1.5 bg-[var(--t-green-hot)]"
              />
            ) : null}
            {roundPhaseCopy[phase].badge}
          </span>
        </div>
        <h2
          id="current-round-heading"
          className="mt-3 font-[family-name:var(--font-plex-sans)] text-3xl font-bold uppercase tracking-tight text-[var(--t-text)] sm:text-4xl"
        >
          Round {round.roundId.toString()}
        </h2>

        <PhaseStatusCopy phase={phase} />
        <NextRoundNotice phase={phase} timeline={round.timeline} />
        <CrashRoundEntry
          countdownSeconds={round.countdownSeconds}
          phase={phase}
          roundId={round.roundId}
        />
        <EncryptedHandle round={round} />
        <VerificationLinks round={round} />
        <p className="mt-4 text-[10px] text-[var(--t-muted)]">
          Read at block {round.blockNumber.toString()}
        </p>
      </div>
    </section>
  );
}

function PhaseStatusCopy({ phase }: { phase: CrashRoundPhase }) {
  const copy = roundPhaseCopy[phase];
  return <StatusCopy title={copy.title} body={copy.body} />;
}

/** Post-lock affordance: when and where entry comes back. */
function NextRoundNotice({
  phase,
  timeline,
}: {
  phase: CrashRoundPhase;
  timeline: RoundTimeline;
}) {
  if (isPreLockPhase(phase)) return null;
  const nextRoundId = (timeline.roundId + 1n).toString();
  return (
    <p
      aria-live="polite"
      className="mt-2 text-xs font-bold tabular-nums text-[var(--t-green-hot)]"
      data-testid="next-round-notice"
    >
      {timeline.nextRoundOpensInSeconds > 0
        ? `Entries reopen in ${formatCountdown(timeline.nextRoundOpensInSeconds)} · Round ${nextRoundId}`
        : `Round ${nextRoundId} opening…`}
    </p>
  );
}

function EncryptedHandle({ round }: { round: ReadyRound }) {
  return (
    <div className="mt-5 border-t border-[var(--t-divider)] pt-4">
      <p className="text-[var(--t-type-label)] uppercase tracking-[0.18em] text-[var(--t-muted)]">
        Encrypted crash handle
      </p>
      {round.crashRandom ? (
        <code className="mt-2 block break-all text-[10px] leading-4 text-[var(--t-accent)] sm:text-xs">
          {round.crashRandom}
        </code>
      ) : (
        <p className="mt-2 text-xs text-[var(--t-muted)]">
          No handle has been pre-committed for this epoch yet.
        </p>
      )}
    </div>
  );
}

function VerificationLinks({ round }: { round: ReadyRound }) {
  const links = [
    round.openingTransactionUrl
      ? { href: round.openingTransactionUrl, label: "Opening tx" }
      : null,
    round.revealTransactionUrl
      ? { href: round.revealTransactionUrl, label: "Reveal tx" }
      : null,
    round.finalizeTransactionUrl
      ? { href: round.finalizeTransactionUrl, label: "Finalization tx" }
      : null,
    round.expireTransactionUrl
      ? { href: round.expireTransactionUrl, label: "Expiry tx" }
      : null,
    { href: round.gameContractUrl, label: "Game contract" },
    { href: round.incoContractUrl, label: "Inco Lightning" },
  ].filter((link): link is { href: string; label: string } => link !== null);

  return (
    <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-2">
      {links.map((link) => (
        <li key={link.label}>
          <a
            className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--t-accent)] underline decoration-[var(--t-border)] underline-offset-4 hover:text-[var(--t-text)]"
            href={link.href}
            rel="noreferrer"
            target="_blank"
          >
            {link.label}
            <span aria-hidden="true" className="ml-1">
              ↗
            </span>
          </a>
        </li>
      ))}
    </ul>
  );
}

function StatusCopy({ title, body }: { title: string; body: string }) {
  return (
    <div className="mt-4">
      <p className="text-sm font-bold text-[var(--t-text)]">{title}</p>
      <p className="mt-2 text-xs leading-5 text-[var(--t-muted)]">{body}</p>
    </div>
  );
}

function CurrentRoundLoading() {
  return (
    <section
      aria-busy="true"
      aria-labelledby="current-round-loading"
      className="border border-[var(--t-border)] px-4 py-8 text-left sm:px-5"
      data-testid="current-round"
    >
      <p
        id="current-round-loading"
        className="text-xs uppercase tracking-[0.2em] text-[var(--t-muted)]"
      >
        Reading current round from Base Sepolia…
      </p>
      <div aria-hidden="true" className="mc-shimmer mt-4 h-1.5 w-40" />
    </section>
  );
}

function CurrentRoundFailure({
  round,
}: {
  round: Extract<CurrentCrashRoundView, { status: "error" | "unavailable" }>;
}) {
  return (
    <section
      aria-labelledby="current-round-failure"
      className="border border-[var(--t-border)] px-4 py-6 text-left sm:px-5"
      data-testid="current-round"
    >
      <h2
        id="current-round-failure"
        className="font-[family-name:var(--font-plex-sans)] text-xl font-bold uppercase text-[var(--t-text)]"
      >
        Current round
      </h2>
      <p className="mt-3 text-sm text-[var(--t-red)]" role="alert">
        {round.error}
      </p>
      {round.status === "error" ? (
        <button
          className={`mt-5 ${TERMINAL_ACTION_BUTTON_CLASS}`}
          onClick={() => void round.retry()}
          type="button"
        >
          Retry round read
        </button>
      ) : null}
    </section>
  );
}
