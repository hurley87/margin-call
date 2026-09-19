"use client";

import {
  DrawablyButton,
  DrawablyCard,
  DrawablyInput,
  DrawablyTextarea,
} from "drawably/react";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import {
  MAX_THESIS_BYTES,
  isThesisWithinLimit,
  thesisByteLength,
} from "@margin-call/shared/thesis";
import { PositionArtwork } from "@/components/positions/position-artwork";
import { TxStatus } from "@/components/protocol/tx-status";
import { PlayfulIcon } from "@/components/ui/playful-icon";
import { SKETCH } from "@/components/ui/sketch";
import { AcquireStockLinks } from "@/components/uniswap/acquire-stock-links";
import { formatShortAddress } from "@/lib/utils";
import {
  curatedArtworkPath,
  stockSymbol,
  type ArtworkFace,
} from "@/lib/positions/artwork";
import {
  formatStockAmount,
  formatUsdcRaw,
  parseStockAmount,
} from "@/lib/protocol/amounts";
import {
  OPENING_LEVERAGE_PRESETS,
  isFinancedLeverage,
  ORACLE_STATE,
  SPOT_LEVERAGE,
  type OracleState,
} from "@/lib/protocol/constants";
import {
  baseDeployment,
  getAssetByName,
  type LaunchAssetName,
} from "@/lib/protocol/deployment";
import type { OpenSnapshot } from "@/lib/protocol/reads";
import type { TxPhase } from "@/lib/protocol/tx-phase";

/** Everything the form collects. Owned by the page so it survives connecting. */
export type CreateDraft = {
  assetName: LaunchAssetName;
  amountInput: string;
  thesis: string;
  leverage: number;
};

/** Present only while the connected wallet sits on a chain other than Base. */
export type WrongNetworkState = {
  canSwitch: boolean;
  switching: boolean;
  error: string | null;
  onSwitch: () => void;
};

/** Base reads, submission, and transaction state — only a live wallet has these. */
type CreateLiveState = {
  snapshot: OpenSnapshot | null;
  pending: boolean;
  ready: boolean;
  statusMessage: string | null;
  readError: string | null;
  wrongNetwork: WrongNetworkState | null;
  onRefresh: () => void;
  onCreate: () => void;
  txPhase: TxPhase;
};

export type CreatePositionViewProps = {
  draft: CreateDraft;
  onDraftChange: (next: CreateDraft) => void;
} & (
  | { mode: "browse"; statusMessage: string }
  | ({ mode: "live" } & CreateLiveState)
);

const COMPANY_NAME: Record<LaunchAssetName, string> = {
  AAPLc: "Apple",
  NVDAc: "NVIDIA",
  GOOGLc: "Alphabet",
  METAc: "Meta",
};

const LEVERAGE_NOTE: Record<number, string> = {
  10_000: "No borrowing",
  11_000: "Light",
  12_500: "Balanced",
  14_000: "Higher",
  15_000: "Maximum",
};

const STAGES: { face: ArtworkFace; label: string }[] = [
  { face: "healthy", label: "Healthy" },
  { face: "warning", label: "Watching" },
  { face: "danger", label: "At risk" },
  { face: "liquidated", label: "Liquidated" },
];

/** Browsing is a real mode, not a live form with every field missing. */
const BROWSING: CreateLiveState = {
  snapshot: null,
  pending: false,
  ready: false,
  statusMessage: null,
  readError: null,
  wrongNetwork: null,
  onRefresh: () => {},
  onCreate: () => {},
  txPhase: { status: "idle" },
};

function StepTitle({
  number,
  children,
}: {
  number: number;
  children: ReactNode;
}) {
  return (
    <span className="create-step-title">
      <span className="create-step-number" aria-hidden="true">
        {number}
      </span>
      <span>{children}</span>
    </span>
  );
}

/** Oracle states are protocol detail; the form only says whether it can price. */
function marketPricingLabel(state: OracleState | null): string {
  if (state == null) return "—";
  return state === ORACLE_STATE.LIVE ? "Live" : "Temporarily unavailable";
}

function leverageStroke(selected: boolean, suggested: boolean): string {
  if (selected) return "#ee771d";
  if (suggested) return "#39854d";
  return "#e5ded3";
}

function StockLogo({ assetName }: { assetName: LaunchAssetName }) {
  const asset = getAssetByName(assetName);
  return (
    <Image
      src={curatedArtworkPath(asset.assetId, "neutral")}
      width={52}
      height={52}
      alt=""
      className="create-stock-logo"
    />
  );
}

function CopyTokenAddress({
  name,
  address,
}: {
  name: LaunchAssetName;
  address: `0x${string}`;
}) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timeout = window.setTimeout(() => setCopied(false), 1600);
    return () => window.clearTimeout(timeout);
  }, [copied]);

  return (
    <button
      type="button"
      className="create-copy-address"
      title={address}
      aria-label={
        copied ? `${name} address copied` : `Copy ${name} token address`
      }
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(address);
          setCopied(true);
        } catch {
          setCopied(false);
        }
      }}
    >
      <span aria-hidden="true">
        {copied ? "Copied" : formatShortAddress(address)}
      </span>
      {copied ? null : (
        <svg
          viewBox="0 0 16 16"
          width="14"
          height="14"
          aria-hidden="true"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="5.2" y="5.2" width="8" height="8" rx="1.6" />
          <path d="M10.8 5.2V3.8A1.6 1.6 0 0 0 9.2 2.2H3.8A1.6 1.6 0 0 0 2.2 3.8v5.4A1.6 1.6 0 0 0 3.8 10.8h1.4" />
        </svg>
      )}
    </button>
  );
}

/** Shared by disconnected browsing and the wallet-backed transaction controller. */
export function CreatePositionView(props: CreatePositionViewProps) {
  const { draft, onDraftChange, statusMessage } = props;
  const {
    snapshot,
    pending,
    ready,
    readError,
    wrongNetwork,
    onRefresh,
    onCreate,
    txPhase,
  } = props.mode === "live" ? props : BROWSING;

  const { assetName, amountInput, leverage, thesis } = draft;
  const update = (patch: Partial<CreateDraft>) =>
    onDraftChange({ ...draft, ...patch });

  const asset = getAssetByName(assetName);
  const symbol = stockSymbol(asset.assetId);
  const amount = parseStockAmount(amountInput);
  const amountLabel =
    amount != null && amount > 0n ? formatStockAmount(amount) : "—";
  const leverageLabel = OPENING_LEVERAGE_PRESETS.find(
    (preset) => preset.bps === leverage
  )?.label;
  const financed = isFinancedLeverage(leverage);
  /** A financed open the oracle cannot price right now. Spot is unaffected. */
  const pricingUnavailable =
    financed && snapshot != null && snapshot.oracleState !== ORACLE_STATE.LIVE;
  const thesisBytes = thesisByteLength(thesis);
  const thesisTooLong = !isThesisWithinLimit(thesis);
  const wanted = amount != null && amount > 0n ? amount : null;
  /** Only a read balance that falls short earns a Uniswap hand-off. */
  const shortfall =
    snapshot != null && wanted != null && snapshot.stockBalance < wanted
      ? { balance: snapshot.stockBalance, wanted }
      : null;
  const contribution = snapshot?.contributionValue ?? null;
  const principal = snapshot?.estimatedPrincipal ?? null;
  const total =
    contribution != null && principal != null ? contribution + principal : null;
  const money = (value: bigint | null) =>
    value == null ? "—" : `${formatUsdcRaw(value)} USDC`;

  return (
    <div className="create-workspace">
      <header className="create-page-heading">
        <div>
          <h1>Create a Position</h1>
          <p>
            Choose a stock, add collateral, and mint your puppy.
            <br />
            Leverage up to 1.5x and let it run.
          </p>
        </div>
        <div className="create-margin-note" aria-hidden="true">
          Same stocks.
          <br />
          more puppies.
          <PlayfulIcon kind="heart" />
        </div>
      </header>
      <div className="create-layout">
        <DrawablyCard {...SKETCH} className="create-form-card" stroke="#e5ded3">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (ready && !pending && !thesisTooLong) onCreate();
            }}
          >
            <fieldset className="create-step" disabled={pending}>
              <legend>
                <StepTitle number={1}>Choose a stock</StepTitle>
              </legend>
              <p className="create-step-description">
                Each stock has its own puppy with a unique look.
              </p>
              <div className="create-stock-options">
                {baseDeployment.assets.map((option) => (
                  <label key={option.name} className="create-choice">
                    <input
                      type="radio"
                      name="stock"
                      aria-label={option.name}
                      value={option.name}
                      checked={assetName === option.name}
                      onChange={() => update({ assetName: option.name })}
                    />
                    <DrawablyCard
                      {...SKETCH}
                      className="create-stock-option"
                      stroke={assetName === option.name ? "#ee771d" : "#e5ded3"}
                    >
                      <StockLogo assetName={option.name} />
                      <strong>{stockSymbol(option.assetId)}</strong>
                      <span>{COMPANY_NAME[option.name]}</span>
                    </DrawablyCard>
                  </label>
                ))}
              </div>
            </fieldset>

            <fieldset className="create-step" disabled={pending}>
              <legend>
                <StepTitle number={2}>
                  Add collateral{" "}
                  <span className="create-legend-detail">(stock tokens)</span>
                </StepTitle>
              </legend>
              <p className="create-step-description">
                Deposit tokenized stock as collateral for your position.
              </p>
              <div className="create-amount-row">
                <div className="create-selected-token">
                  <StockLogo assetName={assetName} />
                  <div className="create-selected-token-meta">
                    <span>{assetName}</span>
                    <CopyTokenAddress
                      key={asset.stock}
                      name={assetName}
                      address={asset.stock}
                    />
                  </div>
                </div>
                <div className="create-amount-control">
                  <DrawablyInput
                    {...SKETCH}
                    stroke="#dcd4c8"
                    className="create-amount-input"
                    aria-label="Stock amount"
                    aria-describedby="create-balance"
                    inputMode="decimal"
                    autoComplete="off"
                    value={amountInput}
                    onChange={(event) =>
                      update({ amountInput: event.target.value })
                    }
                  />
                  <button
                    type="button"
                    className="create-max"
                    disabled={pending || snapshot == null}
                    onClick={() => {
                      if (snapshot)
                        update({
                          amountInput: formatStockAmount(snapshot.stockBalance),
                        });
                    }}
                  >
                    Max
                  </button>
                </div>
              </div>
              <div className="create-amount-hints" id="create-balance">
                <span>
                  Balance:{" "}
                  {snapshot ? formatStockAmount(snapshot.stockBalance) : "—"}{" "}
                  {assetName}
                </span>
                {contribution != null ? (
                  <span>≈ {money(contribution)}</span>
                ) : null}
              </div>
              {shortfall ? (
                <AcquireStockLinks
                  stockName={assetName}
                  stockAddress={asset.stock}
                  stockBalance={shortfall.balance}
                  stockAmount={shortfall.wanted}
                  onRefresh={onRefresh}
                />
              ) : null}
            </fieldset>

            <fieldset className="create-step" disabled={pending}>
              <legend>
                <StepTitle number={3}>Select leverage</StepTitle>
              </legend>
              <p className="create-step-description">
                Higher leverage = higher potential returns (and higher risk).
              </p>
              <div className="create-leverage-options">
                {OPENING_LEVERAGE_PRESETS.map((preset) => (
                  <label key={preset.bps} className="create-choice">
                    <input
                      type="radio"
                      name="leverage"
                      aria-label={preset.label}
                      value={preset.bps}
                      checked={leverage === preset.bps}
                      onChange={() => update({ leverage: preset.bps })}
                    />
                    <DrawablyCard
                      {...SKETCH}
                      className="create-leverage-option"
                      stroke={leverageStroke(
                        leverage === preset.bps,
                        pricingUnavailable && preset.bps === SPOT_LEVERAGE
                      )}
                    >
                      <strong>{preset.label}</strong>
                      <span>{LEVERAGE_NOTE[preset.bps]}</span>
                    </DrawablyCard>
                  </label>
                ))}
              </div>
              <div className="create-borrow-note">
                <span aria-hidden="true">ⓘ</span>
                <p>
                  {!financed ? (
                    "At 1.0x, your position uses your stock collateral with no borrowing."
                  ) : principal != null ? (
                    <>
                      With {leverageLabel} leverage, you’ll borrow approximately{" "}
                      {money(principal)}.
                      {total != null ? (
                        <>
                          <br />
                          Estimated position value: {money(total)}.
                        </>
                      ) : null}
                    </>
                  ) : (
                    <>
                      Your borrowing estimate will appear once your wallet and a
                      live quote are available.
                    </>
                  )}
                </p>
              </div>
            </fieldset>

            <section className="create-step">
              <h2>
                <StepTitle number={4}>Review and create</StepTitle>
              </h2>
              <p className="create-step-description">
                Double-check your details before minting.
              </p>
              <label className="create-thesis-label" htmlFor="create-thesis">
                Thesis <span>(optional)</span>
              </label>
              <DrawablyTextarea
                {...SKETCH}
                stroke={thesisTooLong ? "#b43333" : "#e5ded3"}
                className="create-thesis-input"
                id="create-thesis"
                rows={2}
                value={thesis}
                disabled={pending}
                placeholder="Why this position? Recorded on Base, forever."
                aria-describedby="thesis-budget"
                aria-invalid={thesisTooLong || undefined}
                onChange={(event) => update({ thesis: event.target.value })}
              />
              <p
                id="thesis-budget"
                className={
                  thesisTooLong
                    ? "create-thesis-budget create-error"
                    : "create-thesis-budget"
                }
              >
                {thesisBytes}/{MAX_THESIS_BYTES} bytes
                {thesisTooLong ? " — too long to mint" : ""}
              </p>
              <DrawablyCard
                {...SKETCH}
                className="create-review"
                stroke="#e5ded3"
              >
                <dl>
                  <dt>Stock</dt>
                  <dd className="create-review-stock">
                    <StockLogo assetName={assetName} />
                    {assetName}
                    <CopyTokenAddress
                      key={asset.stock}
                      name={assetName}
                      address={asset.stock}
                    />
                  </dd>
                  <dt>Collateral</dt>
                  <dd>
                    {amountLabel} {assetName}
                  </dd>
                  <dt>Leverage</dt>
                  <dd>{leverageLabel}</dd>
                  <dt>Borrow amount</dt>
                  <dd>{financed ? money(principal) : "0 USDC"}</dd>
                  <dt>Est. position value</dt>
                  <dd>{money(total)}</dd>
                </dl>
              </DrawablyCard>
              <details className="create-protocol-details">
                <summary>Protocol details</summary>
                <p>
                  Allowance:{" "}
                  {snapshot ? formatStockAmount(snapshot.stockAllowance) : "—"}{" "}
                  {assetName}
                </p>
                {financed ? (
                  <>
                    <p>
                      Market pricing:{" "}
                      {marketPricingLabel(snapshot?.oracleState ?? null)}
                    </p>
                    <p>
                      Available credit:{" "}
                      {money(snapshot?.availableCredit ?? null)}
                    </p>
                  </>
                ) : (
                  <p>Spot open — no CreditPool draw.</p>
                )}
              </details>
              {statusMessage ? (
                <p className="create-status" role="status">
                  {statusMessage}
                </p>
              ) : null}
              {pricingUnavailable ? (
                <p className="create-spot-hint">
                  You can still open a 1.0x position, which does not require
                  live pricing.
                </p>
              ) : null}
              {readError ? (
                <div className="create-read-error">
                  <p role="alert">{readError}</p>
                  <DrawablyButton
                    {...SKETCH}
                    onClick={onRefresh}
                    disabled={pending}
                    type="button"
                  >
                    Retry quote
                  </DrawablyButton>
                </div>
              ) : null}
              {wrongNetwork ? (
                <div className="create-switch-network">
                  {wrongNetwork.canSwitch ? (
                    <DrawablyButton
                      {...SKETCH}
                      variant="solid"
                      type="button"
                      className="create-submit"
                      disabled={wrongNetwork.switching}
                      onClick={wrongNetwork.onSwitch}
                    >
                      {wrongNetwork.switching
                        ? "Switching to Base…"
                        : "Switch to Base"}
                      <span aria-hidden="true">→</span>
                    </DrawablyButton>
                  ) : (
                    <p>Switch the wallet to Base mainnet (8453) to continue.</p>
                  )}
                  {wrongNetwork.error ? (
                    <p className="create-error" role="alert">
                      {wrongNetwork.error}
                    </p>
                  ) : null}
                </div>
              ) : (
                <DrawablyButton
                  {...SKETCH}
                  variant="solid"
                  type="submit"
                  className="create-submit"
                  disabled={pending || !ready || thesisTooLong}
                >
                  <PlayfulIcon kind="paw" />
                  {pending ? "Creating position…" : "Create Position"}
                  <span aria-hidden="true">→</span>
                </DrawablyButton>
              )}
              <div className="create-tx-status" aria-live="polite">
                <TxStatus phase={txPhase} />
              </div>
              <p className="create-docs-note">
                Before creating a position, read the{" "}
                <Link href="/docs">docs</Link>.
              </p>
            </section>
          </form>
        </DrawablyCard>

        <aside className="create-preview-column">
          <DrawablyCard
            {...SKETCH}
            className="create-preview-card"
            stroke="#e5ded3"
          >
            <h2>Your puppy preview</h2>
            <p>Here’s what your {symbol} puppy could look like.</p>
            <PositionArtwork
              src={curatedArtworkPath(asset.assetId, "healthy")}
              alt={`${assetName} Position NFT preview`}
              className="create-puppy-preview"
              sizes="(max-width: 850px) 85vw, 480px"
            />
            <p className="create-stages-intro">
              Different states as your position evolves:
            </p>
            <div className="create-stages">
              {STAGES.map(({ face, label }) => (
                <figure
                  key={face}
                  className={`create-stage create-stage-${face}`}
                >
                  <PositionArtwork
                    src={curatedArtworkPath(asset.assetId, face)}
                    alt={`${symbol} ${label.toLowerCase()} artwork`}
                    sizes="(max-width: 480px) 20vw, 110px"
                  />
                  <figcaption>{label}</figcaption>
                </figure>
              ))}
            </div>
          </DrawablyCard>
          <div className="create-explainer">
            <PlayfulIcon kind="chart" />
            <div>
              <h2>A new way to trade the markets</h2>
              <p>
                Each position mints a puppy NFT that evolves with your trade.
                Same stocks. More fun.
              </p>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
