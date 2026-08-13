"use client";

import { AuthGate } from "@/components/auth/auth-gate";
import { GameButton } from "@/components/ui/game-button";
import {
  BOUNDED_ENTRY_ALLOWANCE_TUSD,
  ENTRY_LEVERAGE_TIERS_BPS,
  ENTRY_MARGINS_TUSD,
  formatLeverageBps,
} from "@/lib/margin-call-crash";
import {
  DISPLAY_ASSET_SYMBOL,
  formatDeskDollarsAmount,
} from "@/lib/desk-dollars";
import type { StageCtaKind } from "../use-crash-stage-mode";

export type StageCtaProps = {
  kind: StageCtaKind;
  /** Entry selectors */
  selectedMargin: bigint;
  selectedLeverageBps: bigint;
  expectedPayout: bigint;
  needsApproval: boolean;
  canEnter: boolean;
  onSelectMargin: (margin: bigint) => void;
  onSelectLeverage: (bps: bigint) => void;
  onEnter: () => void;
  /** Settlement */
  onVerify: () => void;
  onClaim: () => void;
  onSettle: () => void;
  onRefund: () => void;
  onExpire: () => void;
  onRetry: () => void;
  retryLabel?: string;
  disabled?: boolean;
  walletRequired?: boolean;
};

const CTA_LABEL: Record<Exclude<StageCtaKind, "none" | "enter">, string> = {
  verify: "Verify and settle",
  claim: "Claim payout",
  "settle-loss": "Settle loss",
  refund: "Refund margin",
  expire: "Mark round expired",
  retry: "Retry",
};

/**
 * Huge DOM CTAs for Enter / Verify and Settle / Claim / Refund.
 * Wallet actions stay as real buttons (not drei Html).
 */
export function StageCta(props: StageCtaProps) {
  if (props.kind === "none") return null;

  return (
    <div
      className="pointer-events-none absolute inset-x-0 bottom-0 z-30 px-4 pb-6 pt-16 sm:px-6 sm:pb-8"
      data-testid="stage-cta"
    >
      <div className="pointer-events-auto mx-auto w-full max-w-xl">
        {props.kind === "enter" ? (
          <EnterCta {...props} />
        ) : (
          <ActionCta {...props} />
        )}
      </div>
    </div>
  );
}

function EnterCta(props: StageCtaProps) {
  if (props.walletRequired) {
    return (
      <div className="rounded-sm border border-[var(--t-border)]/70 bg-[var(--t-bg)]/80 p-5 text-center backdrop-blur-md">
        <p className="text-sm text-[var(--t-muted)]">
          Sign in with phone (top right) to enter this round.
        </p>
      </div>
    );
  }
  return (
    <AuthGate>
      <EnterForm {...props} />
    </AuthGate>
  );
}

function EnterForm(props: StageCtaProps) {
  return (
    <div className="rounded-sm border border-[var(--t-border)]/70 bg-[var(--t-bg)]/80 p-4 backdrop-blur-md sm:p-5">
      <OptionRow
        legend="Margin"
        options={ENTRY_MARGINS_TUSD}
        selected={props.selectedMargin}
        format={(m) => formatDeskDollarsAmount(m)}
        onSelect={props.onSelectMargin}
      />
      <OptionRow
        legend="Arcade Leverage"
        options={ENTRY_LEVERAGE_TIERS_BPS}
        selected={props.selectedLeverageBps}
        format={formatLeverageBps}
        onSelect={props.onSelectLeverage}
      />
      <p className="mt-3 text-xs text-[var(--t-muted)]">
        Max payout{" "}
        <span className="font-bold tabular-nums text-[var(--t-green-hot)]">
          {formatDeskDollarsAmount(props.expectedPayout)}
        </span>
        {" · "}
        one-time {formatDeskDollarsAmount(BOUNDED_ENTRY_ALLOWANCE_TUSD)}{" "}
        {DISPLAY_ASSET_SYMBOL} vault allowance
      </p>
      <GameButton
        className="mt-4 bg-[var(--t-accent)] text-[var(--t-bg)] hover:bg-[var(--t-accent)] hover:text-[var(--t-bg)]"
        disabled={!props.canEnter || props.disabled}
        onClick={props.onEnter}
        size="hero"
      >
        {props.needsApproval ? "Approve & enter" : "Enter round"}
      </GameButton>
    </div>
  );
}

function ActionCta(props: StageCtaProps) {
  const kind = props.kind;
  if (kind === "none" || kind === "enter") return null;

  const onClick = () => {
    switch (kind) {
      case "verify":
        props.onVerify();
        return;
      case "claim":
        props.onClaim();
        return;
      case "settle-loss":
        props.onSettle();
        return;
      case "refund":
        props.onRefund();
        return;
      case "expire":
        props.onExpire();
        return;
      case "retry":
        props.onRetry();
        return;
      default: {
        const _exhaustive: never = kind;
        return _exhaustive;
      }
    }
  };

  const label =
    kind === "retry" ? (props.retryLabel ?? "Retry") : CTA_LABEL[kind];

  return (
    <AuthGate>
      <GameButton
        className="bg-[var(--t-accent)] text-[var(--t-bg)] hover:bg-[var(--t-accent)] hover:text-[var(--t-bg)]"
        disabled={props.disabled}
        onClick={onClick}
        size="hero"
      >
        {label}
      </GameButton>
    </AuthGate>
  );
}

function OptionRow({
  legend,
  options,
  selected,
  format,
  onSelect,
}: {
  legend: string;
  options: readonly bigint[];
  selected: bigint;
  format: (option: bigint) => string;
  onSelect: (option: bigint) => void;
}) {
  return (
    <fieldset className="mt-2 first:mt-0">
      <legend className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--t-muted)]">
        {legend}
      </legend>
      <div className="mt-2 flex flex-wrap gap-2">
        {options.map((option) => {
          const isSelected = selected === option;
          return (
            <button
              aria-pressed={isSelected}
              className={`min-h-11 border px-3 py-2 text-sm font-bold tabular-nums ${
                isSelected
                  ? "border-[var(--t-accent)] bg-[var(--t-accent-soft)] text-[var(--t-accent)]"
                  : "border-[var(--t-border)] text-[var(--t-text)] hover:border-[var(--t-accent)]"
              }`}
              key={option.toString()}
              onClick={() => onSelect(option)}
              type="button"
            >
              {format(option)}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
