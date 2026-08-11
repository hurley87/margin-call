"use client";

import {
  useCurrentCrashRound,
  type CurrentCrashRoundView,
} from "@/hooks/use-current-crash-round";
import type { CrashRoundPhase } from "@/lib/margin-call-crash";
import { CrashRoundEntry } from "./crash-round-entry";

type ReadyRound = Extract<CurrentCrashRoundView, { status: "ready" }>;

const phaseLabels: Record<CrashRoundPhase, string> = {
  prelaunch: "Epoch pending",
  uninitialized: "Awaiting opener",
  open: "Entry open",
  locked: "Entry locked",
  "reveal-requested": "Awaiting attestation",
  "expired-eligible": "Past expiry",
  finalized: "Finalized",
  expired: "Expired",
};

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

export function CurrentRound() {
  const round = useCurrentCrashRound();

  if (round.status === "loading") return <CurrentRoundLoading />;
  if (round.status !== "ready") return <CurrentRoundFailure round={round} />;

  const phase = round.phase;
  return (
    <section
      aria-labelledby="current-round-heading"
      className="mt-10 border-y border-[var(--t-border)] bg-[var(--t-panel)] text-left"
    >
      <div className="grid gap-8 px-5 py-6 sm:px-8 lg:grid-cols-[1fr_auto] lg:items-start lg:py-8">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-[var(--t-type-label)] font-bold uppercase tracking-[0.24em] text-[var(--t-muted)]">
              Base Sepolia · Current round
            </p>
            <span
              className={`inline-flex border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em] ${phaseColors[phase]}`}
            >
              {phaseLabels[phase]}
            </span>
          </div>
          <h2
            id="current-round-heading"
            className="mt-4 font-[family-name:var(--font-plex-sans)] text-4xl font-bold uppercase tracking-tight text-[var(--t-text)] sm:text-6xl"
          >
            Round {round.roundId.toString()}
          </h2>

          <PhasePrimaryContent round={round} />
          <EncryptedHandle round={round} />
          <CrashRoundEntry
            countdownSeconds={round.countdownSeconds}
            phase={phase}
            roundId={round.roundId}
          />
        </div>

        <div className="min-w-44 border-l border-[var(--t-divider)] pl-5 lg:text-right">
          <PhaseSidebar round={round} />
        </div>
      </div>
    </section>
  );
}

function PhasePrimaryContent({ round }: { round: ReadyRound }) {
  switch (round.phase) {
    case "finalized":
      return (
        <div className="mt-6">
          <p className="text-[var(--t-type-label)] uppercase tracking-[0.18em] text-[var(--t-muted)]">
            Verified Crash Point
          </p>
          <p
            aria-label={`Verified crash point ${round.displayCrashPoint}`}
            className="mc-live-value mt-2 font-[family-name:var(--font-plex-sans)] text-5xl font-bold tabular-nums text-[var(--t-green-hot)] sm:text-6xl"
          >
            {round.displayCrashPoint}
          </p>
          <p className="mt-3 max-w-2xl text-xs leading-5 text-[var(--t-muted)]">
            Attested onchain against the exact stored encrypted handle. The
            finalization transaction is the public attestation record.
          </p>
        </div>
      );
    case "locked":
      return (
        <StatusCopy
          title="Awaiting reveal request"
          body="Entry is locked. The encrypted handle stays confidential until a permissionless reveal marks it for public attestation."
        />
      );
    case "reveal-requested":
      return (
        <StatusCopy
          title="Awaiting attestation"
          body="Reveal has been requested. No Crash Point is shown until covalidator signatures finalize the exact stored handle."
        />
      );
    case "expired-eligible":
      return (
        <StatusCopy
          title="Past expiry"
          body="This round can be marked expired. No Crash Point will be invented; original margin becomes refundable after expiry is recorded."
        />
      );
    case "expired":
      return (
        <StatusCopy
          title="Outcome unavailable"
          body="This round expired without a verified Crash Point. Ticket owners can pull back exactly their original margin."
        />
      );
    case "prelaunch":
    case "uninitialized":
    case "open":
      return null;
    default: {
      const _exhaustive: never = round.phase;
      return _exhaustive;
    }
  }
}

function EncryptedHandle({ round }: { round: ReadyRound }) {
  return (
    <div className="mt-6">
      <p className="text-[var(--t-type-label)] uppercase tracking-[0.18em] text-[var(--t-muted)]">
        Public encrypted crash handle
      </p>
      {round.crashRandom ? (
        <code className="mt-2 block break-all text-xs leading-5 text-[var(--t-accent)] sm:text-sm">
          {round.crashRandom}
        </code>
      ) : (
        <p className="mt-2 text-sm text-[var(--t-muted)]">
          No handle has been pre-committed for this epoch yet.
        </p>
      )}
      <p className="mt-3 max-w-2xl text-xs leading-5 text-[var(--t-muted)]">
        The ciphertext is public and auditable. Its plaintext remains
        confidential until attested finalization.
      </p>
    </div>
  );
}

function PhaseSidebar({ round }: { round: ReadyRound }) {
  const phase = round.phase;
  return (
    <>
      <p className="text-[var(--t-type-label)] uppercase tracking-[0.18em] text-[var(--t-muted)]">
        {phase === "open" ? "Entry closes in" : "Entry window"}
      </p>
      <p
        aria-label={
          phase === "open"
            ? `${round.countdownSeconds} seconds until entry locks`
            : "Entry is not open"
        }
        className="mc-live-value mt-2 text-4xl font-bold tabular-nums text-[var(--t-green-hot)]"
      >
        {phase === "open" ? formatCountdown(round.countdownSeconds) : "—:—"}
      </p>
      <p className="mt-5 text-xs text-[var(--t-muted)]">
        Read at block {round.blockNumber.toString()}
      </p>
      <VerificationLinks round={round} />
    </>
  );
}

function VerificationLinks({ round }: { round: ReadyRound }) {
  const links = [
    round.openingTransactionUrl
      ? { href: round.openingTransactionUrl, label: "View opening transaction" }
      : null,
    round.revealTransactionUrl
      ? { href: round.revealTransactionUrl, label: "View reveal transaction" }
      : null,
    round.finalizeTransactionUrl
      ? {
          href: round.finalizeTransactionUrl,
          label: "View finalization transaction",
        }
      : null,
    round.expireTransactionUrl
      ? { href: round.expireTransactionUrl, label: "View expiry transaction" }
      : null,
    { href: round.gameContractUrl, label: "Verified game contract" },
    { href: round.incoContractUrl, label: "Verified Inco Lightning" },
  ].filter((link): link is { href: string; label: string } => link !== null);

  return (
    <ul className="mt-3 space-y-2">
      {links.map((link) => (
        <li key={link.label}>
          <a
            className="group inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.12em] text-[var(--t-accent)] underline decoration-[var(--t-border)] underline-offset-4 hover:text-[var(--t-text)]"
            href={link.href}
            rel="noreferrer"
            target="_blank"
          >
            {link.label}
            <span aria-hidden="true" className="wire-cta-bounce">
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
    <div className="mt-6">
      <p className="text-[var(--t-type-label)] uppercase tracking-[0.18em] text-[var(--t-muted)]">
        Round status
      </p>
      <p className="mt-2 text-lg font-bold text-[var(--t-text)]">{title}</p>
      <p className="mt-3 max-w-2xl text-xs leading-5 text-[var(--t-muted)]">
        {body}
      </p>
    </div>
  );
}

function CurrentRoundLoading() {
  return (
    <section
      aria-busy="true"
      aria-labelledby="current-round-loading"
      className="mt-10 border-y border-[var(--t-border)] px-5 py-10 text-left sm:px-8"
    >
      <p
        id="current-round-loading"
        className="text-xs uppercase tracking-[0.2em] text-[var(--t-muted)]"
      >
        Reading current round from Base Sepolia…
      </p>
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
      className="mt-10 border-y border-[var(--t-border)] px-5 py-8 text-left sm:px-8"
    >
      <h2
        id="current-round-failure"
        className="font-[family-name:var(--font-plex-sans)] text-2xl font-bold uppercase text-[var(--t-text)]"
      >
        Current round
      </h2>
      <p className="mt-3 text-sm text-[var(--t-red)]" role="alert">
        {round.error}
      </p>
      {round.status === "error" ? (
        <button
          className="mt-5 border border-[var(--t-accent)] px-4 py-2 text-xs font-bold uppercase tracking-[0.14em] text-[var(--t-accent)] hover:bg-[var(--t-accent-soft)]"
          onClick={() => void round.retry()}
          type="button"
        >
          Retry round read
        </button>
      ) : null}
    </section>
  );
}

function formatCountdown(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes.toString().padStart(2, "0")}:${remainingSeconds
    .toString()
    .padStart(2, "0")}`;
}
