"use client";

import { useEffect, useRef, type ReactNode } from "react";
import {
  useCrashRoundEntry,
  type CrashEntryRetryAction,
  type CrashEntryStatus,
} from "@/hooks/use-crash-round-entry";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { getTheaterAudio } from "@/lib/theater-audio";
import {
  BOUNDED_ENTRY_ALLOWANCE_TUSD,
  canOfferEntry,
  ENTRY_LEVERAGE_TIERS_BPS,
  ENTRY_MARGINS_TUSD,
  formatLeverageBps,
  type CrashRoundPhase,
} from "@/lib/margin-call-crash";
import {
  DISPLAY_ASSET_SYMBOL,
  formatDeskDollarsAmount,
  formatDeskDollarsAmountLabel,
} from "@/lib/desk-dollars";
import { armedEntryCopy, formatArmedEntryCta } from "@/lib/round-phase-copy";
import { STAGE_DOCK_STICKY_CTA_CLASS } from "@/components/crash-stage/overlay/stage-dock-chrome";
import { SignInCta } from "@/components/auth/sign-in-cta";
import { TERMINAL_ACTION_BUTTON_CLASS } from "@/lib/utils";
import { entrySubmitLabel } from "@/lib/entry-submit-label";
import { DeskDollarsFaucet } from "@/components/desk-dollars/desk-dollars-faucet";
import { GameButton } from "@/components/ui/game-button";
import { FlashValue } from "@/components/ui/flash-value";
import { EntryOptionGroup } from "./entry-option-group";
import { CrashLiveTicket } from "./crash-live-ticket";

const statusCopy: Partial<Record<CrashEntryStatus, string>> = {
  loading: "Loading your entry state…",
  "approval-submitting": `Submitting a one-time 1,000 ${DISPLAY_ASSET_SYMBOL} approval…`,
  "approval-pending":
    "Bounded approval pending until its Base Sepolia receipt succeeds…",
  "entry-submitting": "Submitting your sponsored entry…",
  "entry-pending":
    "Entry pending until its Base Sepolia receipt succeeds. Your ticket will not appear until confirmation.",
  confirmed: "Entry confirmed on Base Sepolia.",
};

const retryLabels: Record<CrashEntryRetryAction, string> = {
  refresh: "Retry",
  approval: "Retry approval",
  entry: "Retry entry",
  "approval-receipt-check": "Retry approval receipt check",
  "entry-receipt-check": "Retry entry receipt check",
};

type CrashRoundEntryProps = {
  roundId: bigint;
  phase: CrashRoundPhase;
  countdownSeconds: number;
  /**
   * Pre-entry wait: pickers stay interactive, CTA disabled until the next
   * window opens. Mounted by StageActions when dock kind is `arm`.
   */
  armed?: boolean;
};

/**
 * Player entry surface for the current Crash round.
 * Offers 1/5/10 USDC margins and six leverage tiers only into initialized
 * open rounds with more than five seconds remaining before lock. When `armed`,
 * the same pickers stay visible with a disabled countdown CTA.
 */
export function CrashRoundEntry({
  roundId,
  phase,
  countdownSeconds,
  armed = false,
}: CrashRoundEntryProps) {
  const entry = useCrashRoundEntry({ roundId });
  const reducedMotion = useReducedMotion();

  // Entry-confirmed moment: one chirp when the receipt lands this session.
  const previousStatus = useRef(entry.status);
  useEffect(() => {
    if (
      !reducedMotion &&
      entry.status === "confirmed" &&
      previousStatus.current !== "confirmed"
    ) {
      getTheaterAudio().playEntryConfirm();
    }
    previousStatus.current = entry.status;
  }, [entry.status, reducedMotion]);

  if (entry.ticket) {
    const justEntered = entry.status === "confirmed";
    return (
      <EntryShell heading="Enter this round">
        <div className={justEntered ? "mc-onboard-flash" : undefined}>
          <CrashLiveTicket ticket={entry.ticket} />
        </div>
      </EntryShell>
    );
  }

  if (armed) {
    const drainFraction = Math.min(1, Math.max(0, countdownSeconds / 60));
    return (
      <EntryShell
        footer={
          entry.walletAddress ? (
            <div className="relative overflow-hidden">
              <GameButton
                className="relative z-10 w-full bg-[var(--t-accent)] text-[var(--t-bg)] hover:bg-[var(--t-accent)] hover:text-[var(--t-bg)]"
                disabled
                size="hero"
              >
                {formatArmedEntryCta(countdownSeconds)}
              </GameButton>
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-y-0 left-0 z-0 origin-left bg-[var(--t-accent)]/35"
                style={{
                  width: "100%",
                  transform: `scaleX(${drainFraction})`,
                  transition: "transform var(--mc-dur-base) var(--mc-ease-out)",
                }}
              />
            </div>
          ) : null
        }
        heading="Next round"
      >
        <p className="text-sm text-[var(--t-muted)]">{armedEntryCopy(phase)}</p>
        <EntryPickers entry={entry} signedOut={!entry.walletAddress} />
        {!entry.walletAddress ? (
          <SignInCta className="mt-3 sm:mt-4" />
        ) : (
          <>
            <DeskDollarsFaucet className="mt-3 sm:mt-4" />
            <ApprovalDetails entry={entry} />
          </>
        )}
      </EntryShell>
    );
  }

  if (phase === "uninitialized" || phase === "prelaunch") {
    return (
      <EntryShell heading="Enter this round">
        <p className="text-sm text-[var(--t-muted)]">
          Waiting for an ETH-holding opener to initialize this epoch. Embedded
          wallets never create rounds, so entry stays closed until a handle is
          pre-committed onchain.
        </p>
      </EntryShell>
    );
  }

  if (phase !== "open") {
    return null;
  }

  if (!canOfferEntry(phase, countdownSeconds)) {
    return (
      <EntryShell heading="Enter this round">
        <p className="text-sm text-[var(--t-amber-hot)]" role="status">
          Entry cutoff — less than five seconds remain before onchain lock. New
          entries are no longer offered.
        </p>
      </EntryShell>
    );
  }

  if (!entry.walletAddress) {
    return (
      <EntryShell heading="Enter this round">
        <p className="hidden text-sm text-[var(--t-text)] sm:block">
          Choose margin and Arcade Leverage. Expected payout is the maximum
          reservation, not a guaranteed return.
        </p>
        <EntryPickers entry={entry} signedOut />
        <SignInCta className="mt-3 sm:mt-4" />
      </EntryShell>
    );
  }

  if (entry.status === "unavailable") {
    return (
      <EntryShell heading="Enter this round">
        <p className="text-sm text-[var(--t-red)]" role="alert">
          {entry.error}
        </p>
      </EntryShell>
    );
  }

  const isAlert = entry.status === "error";
  const statusMessage = isAlert
    ? entry.error
    : (statusCopy[entry.status] ?? null);
  const retryLabel = entry.retryAction
    ? retryLabels[entry.retryAction]
    : "Retry";
  const entryJustOpened = canOfferEntry(phase, countdownSeconds);

  return (
    <EntryShell
      footer={
        <>
          <div
            className={`relative overflow-hidden ${
              entryJustOpened ? "mc-onboard-flash" : ""
            }`}
          >
            <GameButton
              className="relative z-10 w-full bg-[var(--t-accent)] text-[var(--t-bg)] hover:bg-[var(--t-accent)] hover:text-[var(--t-bg)]"
              disabled={!entry.canEnter}
              onClick={() => void entry.enter()}
              size="hero"
            >
              {entrySubmitLabel(entry.status, entry.needsApproval)}
            </GameButton>
            {entry.canEnter ? (
              <span
                aria-hidden="true"
                className="mc-cta-shimmer pointer-events-none absolute inset-0 z-20"
              />
            ) : null}
          </div>
          {entry.canRetry ? (
            <button
              className={TERMINAL_ACTION_BUTTON_CLASS}
              onClick={() => void entry.retry()}
              type="button"
            >
              {retryLabel}
            </button>
          ) : null}
        </>
      }
      heading="Enter this round"
    >
      <p className="hidden text-sm text-[var(--t-text)] sm:block">
        Choose margin and Arcade Leverage. Expected payout is the maximum
        reservation, not a guaranteed return.
      </p>

      <EntryPickers entry={entry} />

      <DeskDollarsFaucet className="mt-3 sm:mt-4" />

      {statusMessage ? (
        <p
          className={`mt-3 text-sm sm:mt-4 ${
            isAlert ? "text-[var(--t-red)]" : "text-[var(--t-muted)]"
          }`}
          role={isAlert ? "alert" : "status"}
        >
          {statusMessage}
        </p>
      ) : null}

      <ApprovalDetails entry={entry} />
    </EntryShell>
  );
}

type EntryView = ReturnType<typeof useCrashRoundEntry>;

function EntryPickers({
  entry,
  signedOut = false,
}: {
  entry: EntryView;
  signedOut?: boolean;
}) {
  return (
    <>
      <EntryOptionGroup
        legend="Margin"
        options={ENTRY_MARGINS_TUSD}
        selected={entry.selectedMargin}
        format={(margin) => formatDeskDollarsAmount(margin)}
        onSelect={entry.selectMargin}
      />

      <EntryOptionGroup
        legend="Arcade Leverage"
        options={ENTRY_LEVERAGE_TIERS_BPS}
        selected={entry.selectedLeverageBps}
        format={formatLeverageBps}
        onSelect={entry.selectLeverage}
      />

      {!signedOut ? (
        <dl className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[11px] tabular-nums sm:mt-4 sm:grid sm:grid-cols-2 sm:gap-3 sm:text-sm">
          <div className="flex items-baseline gap-1.5 sm:block">
            <dt className="text-[var(--t-muted)]">
              <span className="sm:hidden">Wallet</span>
              <span className="hidden sm:inline">Wallet Desk Dollars</span>
            </dt>
            <dd className="tabular-nums text-[var(--t-text)]">
              {formatDeskDollarsAmountLabel(entry.tUsdBalance)}
            </dd>
          </div>
          <div className="flex items-baseline gap-1.5 sm:block">
            <dt className="text-[var(--t-muted)]">
              <span className="sm:hidden">Max</span>
              <span className="hidden sm:inline">Expected maximum payout</span>
            </dt>
            <dd className="tabular-nums text-[var(--t-green-hot)]">
              <FlashValue value={entry.expectedPayout}>
                {formatDeskDollarsAmount(entry.expectedPayout)}
              </FlashValue>
            </dd>
          </div>
        </dl>
      ) : (
        <dl className="mt-3 text-[11px] tabular-nums sm:mt-4 sm:text-sm">
          <div className="flex items-baseline gap-1.5 sm:block">
            <dt className="text-[var(--t-muted)]">Expected maximum payout</dt>
            <dd className="tabular-nums text-[var(--t-green-hot)]">
              <FlashValue value={entry.expectedPayout}>
                {formatDeskDollarsAmount(entry.expectedPayout)}
              </FlashValue>
            </dd>
          </div>
        </dl>
      )}
    </>
  );
}

function ApprovalDetails({ entry }: { entry: EntryView }) {
  return (
    <details className="mt-3 text-xs leading-5 text-[var(--t-muted)] sm:mt-4">
      <summary className="cursor-pointer font-bold uppercase tracking-[0.14em] text-[var(--t-accent)]">
        Approval details
      </summary>
      <div className="mt-2 border border-[var(--t-border)] p-3">
        <p>
          Spender: Bankroll Vault
          {entry.vaultAddress ? (
            <>
              {" "}
              <code className="break-all text-[var(--t-accent)]">
                {entry.vaultAddress}
              </code>
            </>
          ) : null}
        </p>
        <p className="mt-2">
          One-time bounded approval:{" "}
          {formatDeskDollarsAmount(BOUNDED_ENTRY_ALLOWANCE_TUSD)}. Later entries
          reuse this allowance with sponsored enter-only transactions. This
          interface never requests an unlimited allowance.
        </p>
        <p className="mt-2">
          Game contract
          {entry.gameAddress ? (
            <>
              :{" "}
              <code className="break-all text-[var(--t-accent)]">
                {entry.gameAddress}
              </code>
            </>
          ) : null}
          . Margin moves directly from your wallet to the vault.
        </p>
        <p className="mt-2">
          Current vault allowance:{" "}
          {formatDeskDollarsAmountLabel(entry.allowance)}. Selected margin:{" "}
          {formatDeskDollarsAmount(entry.selectedMargin)}.
        </p>
        {entry.needsApproval ? (
          <p className="mt-2 text-[var(--t-amber-hot)]">
            Your first entry will submit the bounded approval, wait for its
            receipt, then submit enter.
          </p>
        ) : (
          <p className="mt-2 text-[var(--t-green)]">
            Allowance already covers this margin. Only a sponsored enter will be
            submitted.
          </p>
        )}
      </div>
    </details>
  );
}

/**
 * Scrollable pickers + pinned footer CTA so Enter stays on screen.
 */
function EntryShell({
  children,
  heading,
  footer,
}: {
  children: ReactNode;
  heading: string;
  footer?: ReactNode;
}) {
  return (
    <div
      aria-labelledby="crash-entry-heading"
      className="flex min-h-0 flex-1 flex-col text-left"
    >
      <div
        className="min-h-0 flex-1 overflow-y-auto p-2.5 sm:p-4"
        data-testid="stage-actions-body"
      >
        <h3
          id="crash-entry-heading"
          className="font-[family-name:var(--font-plex-sans)] text-base font-bold uppercase tracking-tight text-[var(--t-accent)] sm:text-lg"
        >
          {heading}
        </h3>
        <div className="mt-2 sm:mt-3">{children}</div>
      </div>
      {footer ? (
        <div className={STAGE_DOCK_STICKY_CTA_CLASS}>{footer}</div>
      ) : null}
    </div>
  );
}
