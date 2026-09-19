"use client";

import { DrawablyCard, DrawablyInput, DrawablyTextarea } from "drawably/react";
import Image from "next/image";
import { useEffect, useState, type ReactNode } from "react";
import { MAX_THESIS_BYTES, thesisByteLength } from "@margin-call/shared/thesis";
import { PositionArtwork } from "@/components/positions/position-artwork";
import { TxStatus } from "@/components/protocol/tx-status";
import { PlayfulIcon } from "@/components/ui/playful-icon";
import { SketchButton } from "@/components/ui/sketch-button";
import { formatShortAddress } from "@/lib/utils";
import {
  artworkPath,
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
} from "@/lib/protocol/constants";
import {
  getAssetByName,
  type LaunchAssetName,
} from "@/lib/protocol/deployment";
import type { OpenSnapshot } from "@/lib/protocol/reads";
import type { TxPhase } from "@/lib/protocol/tx-phase";
import { PRODUCT_DOCS_URL } from "@/lib/product-docs";

export type CreateDraft = {
  assetName: LaunchAssetName;
  setAssetName: (name: LaunchAssetName) => void;
  amountInput: string;
  setAmountInput: (amount: string) => void;
  thesis: string;
  setThesis: (thesis: string) => void;
  leverage: number;
  setLeverage: (leverage: number) => void;
};

type CreatePositionViewProps = {
  draft: CreateDraft;
  snapshot?: OpenSnapshot | null;
  pending?: boolean;
  ready?: boolean;
  statusMessage?: string | null;
  readError?: string | null;
  onRefresh?: () => void;
  onCreate?: () => void;
  txPhase?: TxPhase;
};

const STOCKS = [
  { name: "AAPLc", company: "Apple" },
  { name: "NVDAc", company: "NVIDIA" },
  { name: "GOOGLc", company: "Alphabet" },
  { name: "METAc", company: "Meta" },
] as const;
const LEVERAGE_NOTES = [
  "No borrowing",
  "Light",
  "Balanced",
  "Higher",
  "Maximum",
];
const STAGES: { face: ArtworkFace; label: string }[] = [
  { face: "healthy", label: "Healthy" },
  { face: "warning", label: "Watching" },
  { face: "danger", label: "At risk" },
  { face: "liquidated", label: "Liquidated" },
];
const SKETCH = { roughness: 0.5, boil: 0, seed: 42 } as const;

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

function StockLogo({ assetName }: { assetName: LaunchAssetName }) {
  const asset = getAssetByName(assetName);
  return (
    <Image
      src={artworkPath(asset.assetId, "neutral")!}
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
export function CreatePositionView({
  draft,
  snapshot = null,
  pending = false,
  ready = false,
  statusMessage,
  readError,
  onRefresh,
  onCreate,
  txPhase = { status: "idle" },
}: CreatePositionViewProps) {
  const {
    assetName,
    amountInput,
    leverage,
    thesis,
    setAssetName,
    setAmountInput,
    setLeverage,
    setThesis,
  } = draft;
  const asset = getAssetByName(assetName);
  const symbol = stockSymbol(asset.assetId);
  const amount = parseStockAmount(amountInput);
  const amountLabel =
    amount != null && amount > 0n ? formatStockAmount(amount) : "—";
  const leverageLabel = OPENING_LEVERAGE_PRESETS.find(
    (preset) => preset.bps === leverage
  )?.label;
  const financed = isFinancedLeverage(leverage);
  const thesisBytes = thesisByteLength(thesis);
  const thesisTooLong = thesisBytes > MAX_THESIS_BYTES;
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
              if (ready && !pending && !thesisTooLong) onCreate?.();
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
                {STOCKS.map(({ name, company }) => (
                  <label key={name} className="create-choice">
                    <input
                      type="radio"
                      name="stock"
                      aria-label={name}
                      value={name}
                      checked={assetName === name}
                      onChange={() => setAssetName(name)}
                    />
                    <DrawablyCard
                      {...SKETCH}
                      className="create-stock-option"
                      stroke={assetName === name ? "#ee771d" : "#e5ded3"}
                    >
                      <StockLogo assetName={name} />
                      <strong>
                        {stockSymbol(getAssetByName(name).assetId)}
                      </strong>
                      <span>{company}</span>
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
                    onChange={(event) => setAmountInput(event.target.value)}
                  />
                  <button
                    type="button"
                    className="create-max"
                    disabled={pending || snapshot == null}
                    onClick={() => {
                      if (snapshot)
                        setAmountInput(
                          formatStockAmount(snapshot.stockBalance)
                        );
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
            </fieldset>

            <fieldset className="create-step" disabled={pending}>
              <legend>
                <StepTitle number={3}>Select leverage</StepTitle>
              </legend>
              <p className="create-step-description">
                Higher leverage = higher potential returns (and higher risk).
              </p>
              <div className="create-leverage-options">
                {OPENING_LEVERAGE_PRESETS.map((preset, index) => (
                  <label key={preset.bps} className="create-choice">
                    <input
                      type="radio"
                      name="leverage"
                      aria-label={preset.label}
                      value={preset.bps}
                      checked={leverage === preset.bps}
                      onChange={() => setLeverage(preset.bps)}
                    />
                    <DrawablyCard
                      {...SKETCH}
                      className="create-leverage-option"
                      stroke={leverage === preset.bps ? "#ee771d" : "#e5ded3"}
                    >
                      <strong>{preset.label}</strong>
                      <span>{LEVERAGE_NOTES[index]}</span>
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
                onChange={(event) => setThesis(event.target.value)}
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
                      Oracle:{" "}
                      {snapshot?.oracleState == null
                        ? "—"
                        : snapshot.oracleState === ORACLE_STATE.LIVE
                          ? "LIVE"
                          : snapshot.oracleState === ORACLE_STATE.HELD
                            ? "HELD"
                            : "INVALID"}
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
              {readError ? (
                <div className="create-read-error">
                  <p role="alert">{readError}</p>
                  <SketchButton
                    onClick={onRefresh}
                    disabled={pending}
                    type="button"
                  >
                    Retry quote
                  </SketchButton>
                </div>
              ) : null}
              <SketchButton
                variant="solid"
                type="submit"
                className="create-submit"
                disabled={pending || !ready || thesisTooLong}
              >
                <PlayfulIcon kind="paw" />
                {pending ? "Creating position…" : "Create Position"}
                <span aria-hidden="true">→</span>
              </SketchButton>
              <div className="create-tx-status" aria-live="polite">
                <TxStatus phase={txPhase} />
              </div>
              <p className="create-docs-note">
                Before creating a position, read the{" "}
                <a href={PRODUCT_DOCS_URL}>protocol docs and risks</a>.
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
              src={artworkPath(asset.assetId, "healthy")}
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
                    src={artworkPath(asset.assetId, face)}
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
