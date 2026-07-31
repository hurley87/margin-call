"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  PAYMENT_CHAIN,
  PAYMENT_EXPLORER_URL,
  ROBINHOOD_TESTNET_STOCK_TOKENS,
  assetRegistryAbi,
  createRobinhoodPublicClient,
  erc20Abi,
  getPackMintedTokenId,
  packCustodyAbi,
  ripEngineAbi,
  txExplorerUrl,
  type StockToken,
} from "@margin-call/shared";
import {
  type Address,
  type Hash,
  type PublicClient,
  type TransactionReceipt,
} from "viem";

import { GameButton } from "@/components/ui/game-button";
import { useMakerTransactionClient } from "@/hooks/use-maker-transaction-client";
import { getContractAddresses } from "@/lib/contracts/addresses";
import { formatWadUsd } from "@/lib/pool/nav-distribution";
import {
  formatAllowanceDisplay,
  formatTokenAmountDisplay,
} from "@/lib/token-display";
import {
  buildPackPlan,
  createAndEnrollPack,
  enrollMintedPack,
  parseTokenAmount,
  transactionPhaseMessage,
  type PackPlan,
  type PackTransactionAdapter,
  type TokenAmountInput,
  type TransactionPhase,
} from "@/lib/maker/pack-composer";
import { describeAssetRegistryQuoteError } from "@/lib/maker/quote-errors";
import {
  PendingTransactionError,
  createBrowserJournalStorage,
  ensureWorkflow,
  listWorkflows,
  requestFingerprint,
  type LifecycleWorkflow,
} from "@/lib/maker/transaction-journal";

const FAUCET_URL = "https://faucet.testnet.chain.robinhood.com";

type TokenRead = {
  balance?: bigint;
  allowance?: bigint;
  quote?: bigint;
  quoteError?: string;
};

type ChainReads = {
  tokens: Record<string, TokenRead>;
  minPackNav?: bigint;
  poolMax?: bigint;
  error?: string;
};

type ComposerAddresses = NonNullable<ReturnType<typeof getContractAddresses>>;

type ViewProps = {
  walletAddress: Address;
  values: Record<string, string>;
  reads: ChainReads;
  plan: PackPlan;
  phase: TransactionPhase;
  mintedTokenId: bigint | null;
  isReading: boolean;
  isBusy: boolean;
  configured: boolean;
  onAmountChange: (symbol: string, value: string) => void;
  onRefresh: () => void;
  onSubmit: () => void;
  onRetryEnrollment: () => void;
  onComposeAnother: () => void;
};

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) {
    const message = error.message;
    if (/reject|denied|declined/i.test(message)) {
      return `Transaction rejected: ${message}`;
    }
    return message;
  }
  return fallback;
}

function phaseHash(phase: TransactionPhase): Hash | null {
  switch (phase.kind) {
    case "approval-pending":
    case "mint-pending":
    case "enrollment-pending":
      return phase.hash;
    case "error":
      return phase.hash ?? null;
    default:
      return null;
  }
}

function workflowPlan(
  workflow: LifecycleWorkflow
): Pick<PackPlan, "selected" | "approvals"> {
  const raw = workflow.context.plan;
  if (typeof raw !== "string") throw new Error("Saved Pack plan is missing");
  const saved = JSON.parse(raw) as Array<{
    symbol: string;
    address: Address;
    amount: string;
    allowance: string;
    quote: string;
    needsApproval: boolean;
  }>;
  const selected = saved.map((token) => ({
    symbol: token.symbol,
    address: token.address,
    amount: BigInt(token.amount),
    allowance: BigInt(token.allowance),
    quote: BigInt(token.quote),
  }));
  return {
    selected,
    approvals: selected.filter((_, index) => saved[index]!.needsApproval),
  };
}

function inputRows(
  values: Record<string, string>,
  reads: ChainReads
): TokenAmountInput[] {
  return ROBINHOOD_TESTNET_STOCK_TOKENS.map((token) => ({
    ...token,
    value: values[token.symbol] ?? "",
    ...reads.tokens[token.symbol],
  }));
}

async function readComposerChainState(
  publicClient: PublicClient,
  addresses: ComposerAddresses,
  walletAddress: Address,
  values: Record<string, string>
): Promise<ChainReads> {
  const tokenReads: Record<string, TokenRead> = {};

  try {
    const [band, balancesAndAllowances] = await Promise.all([
      Promise.all([
        publicClient.readContract({
          address: addresses.assetRegistry,
          abi: assetRegistryAbi,
          functionName: "minPackNav",
        }),
        publicClient.readContract({
          address: addresses.assetRegistry,
          abi: assetRegistryAbi,
          functionName: "poolMax",
        }),
      ]),
      Promise.all(
        ROBINHOOD_TESTNET_STOCK_TOKENS.map(async (token) => {
          const [balance, allowance] = await Promise.all([
            publicClient.readContract({
              address: token.address,
              abi: erc20Abi,
              functionName: "balanceOf",
              args: [walletAddress],
            }),
            publicClient.readContract({
              address: token.address,
              abi: erc20Abi,
              functionName: "allowance",
              args: [walletAddress, addresses.packCustody],
            }),
          ]);
          return { token, balance, allowance };
        })
      ),
    ]);

    for (const { token, balance, allowance } of balancesAndAllowances) {
      tokenReads[token.symbol] = { balance, allowance };
    }

    await Promise.all(
      ROBINHOOD_TESTNET_STOCK_TOKENS.map(async (token) => {
        const value = values[token.symbol] ?? "";
        if (!value.trim()) return;
        const parsed = parseTokenAmount(value, token.decimals);
        if (!parsed.ok) return;
        try {
          tokenReads[token.symbol].quote = await publicClient.readContract({
            address: addresses.assetRegistry,
            abi: assetRegistryAbi,
            functionName: "quote",
            args: [token.address, parsed.amount],
          });
        } catch (error) {
          tokenReads[token.symbol].quoteError =
            describeAssetRegistryQuoteError(error);
        }
      })
    );

    return {
      tokens: tokenReads,
      minPackNav: band[0],
      poolMax: band[1],
    };
  } catch (error) {
    return {
      tokens: tokenReads,
      error: errorMessage(error, "Chain reads unavailable"),
    };
  }
}

function makeTransactionAdapter(
  publicClient: PublicClient,
  walletClient: Awaited<
    ReturnType<ReturnType<typeof useMakerTransactionClient>["getWalletClient"]>
  >,
  walletAddress: Address,
  addresses: ComposerAddresses
): PackTransactionAdapter {
  return {
    approve: (token, amount) =>
      walletClient.writeContract({
        account: walletAddress,
        chain: PAYMENT_CHAIN,
        address: token,
        abi: erc20Abi,
        functionName: "approve",
        args: [addresses.packCustody, amount],
      }),
    mint: (assets, amounts) =>
      walletClient.writeContract({
        account: walletAddress,
        chain: PAYMENT_CHAIN,
        address: addresses.packCustody,
        abi: packCustodyAbi,
        functionName: "mint",
        args: [assets, amounts],
      }),
    enterPool: (tokenId) =>
      walletClient.writeContract({
        account: walletAddress,
        chain: PAYMENT_CHAIN,
        address: addresses.ripEngine,
        abi: ripEngineAbi,
        functionName: "enterPool",
        args: [tokenId],
      }),
    waitForReceipt: (hash) => publicClient.waitForTransactionReceipt({ hash }),
    getMintedTokenId: (receipt: TransactionReceipt) =>
      getPackMintedTokenId(receipt, addresses.packCustody),
  };
}

export function PackComposerView({
  walletAddress,
  values,
  reads,
  plan,
  phase,
  mintedTokenId,
  isReading,
  isBusy,
  configured,
  onAmountChange,
  onRefresh,
  onSubmit,
  onRetryEnrollment,
  onComposeAnother,
}: ViewProps) {
  const hash = phaseHash(phase);
  const showErrors = Object.values(values).some((value) => value.trim());

  return (
    <section className="mt-10" aria-labelledby="pack-composer-heading">
      <p className="text-[11px] font-bold uppercase tracking-[0.28em] text-[var(--t-green)]">
        Maker
      </p>
      <h2
        id="pack-composer-heading"
        className="mt-2 font-[family-name:var(--font-plex-sans)] text-2xl font-black uppercase text-[var(--t-accent)]"
      >
        Compose a Pack
      </h2>
      <p className="mt-3 text-sm leading-6 text-[var(--t-muted)]">
        The Starter Grant is MockUSD for Rips. It does not fund Maker Stock
        Token inventory. Get Robinhood testnet Stock Tokens and gas from the{" "}
        <a
          className="text-[var(--t-accent)] underline underline-offset-4"
          href={FAUCET_URL}
          target="_blank"
          rel="noreferrer"
        >
          Robinhood faucet
        </a>
        .
      </p>

      {!configured ? (
        <p role="alert" className="mt-4 text-sm text-[var(--t-red)]">
          Robinhood testnet contract addresses are not configured.
        </p>
      ) : (
        <>
          <div className="mt-5 space-y-3">
            {ROBINHOOD_TESTNET_STOCK_TOKENS.map((token) => {
              const tokenRead = reads.tokens[token.symbol] ?? {};
              const balance = formatTokenAmountDisplay(
                tokenRead.balance,
                token.decimals
              );
              const allowance = formatAllowanceDisplay(
                tokenRead.allowance,
                token.decimals
              );
              const parsed = parseTokenAmount(
                values[token.symbol] ?? "",
                token.decimals
              );
              const inputError =
                values[token.symbol]?.trim() && !parsed.ok
                  ? parsed.error
                  : null;
              return (
                <div
                  key={token.address}
                  className="grid min-w-0 gap-2 overflow-hidden border border-[var(--t-divider)]/50 bg-[var(--t-panel)]/40 p-3 sm:grid-cols-[5rem_minmax(0,1fr)_minmax(0,12rem)] sm:items-center"
                >
                  <label
                    htmlFor={`pack-${token.symbol}`}
                    className="min-w-0 break-all font-bold text-[var(--t-accent)]"
                  >
                    {token.symbol}
                  </label>
                  <input
                    id={`pack-${token.symbol}`}
                    inputMode="decimal"
                    autoComplete="off"
                    placeholder="0"
                    value={values[token.symbol] ?? ""}
                    onChange={(event) =>
                      onAmountChange(token.symbol, event.target.value)
                    }
                    disabled={isBusy}
                    aria-describedby={`pack-${token.symbol}-details`}
                    className="min-h-11 min-w-0 border border-[var(--t-divider)] bg-[var(--t-bg)] px-3 text-[var(--t-text)] outline-none focus:border-[var(--t-accent)] disabled:opacity-50"
                  />
                  <div
                    id={`pack-${token.symbol}-details`}
                    className="min-w-0 max-w-full overflow-hidden text-xs text-[var(--t-muted)] sm:text-right"
                  >
                    <p className="flex min-w-0 gap-1 sm:justify-end">
                      <span className="shrink-0">Balance</span>
                      <span
                        className="min-w-0 truncate tabular-nums"
                        title={balance.exact}
                        aria-label={balance.exact}
                      >
                        {balance.compact}
                      </span>
                    </p>
                    <p className="flex min-w-0 gap-1 sm:justify-end">
                      <span className="shrink-0">Allowance</span>
                      <span
                        className="min-w-0 truncate tabular-nums"
                        title={allowance.exact}
                        aria-label={allowance.exact}
                      >
                        {allowance.compact}
                      </span>
                    </p>
                    {tokenRead.quote !== undefined && (
                      <p className="text-[var(--t-green)]">
                        Quote {formatWadUsd(tokenRead.quote.toString())}
                      </p>
                    )}
                    {inputError && (
                      <p className="text-[var(--t-red)]">{inputError}</p>
                    )}
                    {tokenRead.quoteError && (
                      <p className="text-[var(--t-red)]">
                        {tokenRead.quoteError}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-4 border border-[var(--t-divider)]/50 p-4 text-sm">
            <div className="flex flex-wrap justify-between gap-2">
              <span>Quoted basket NAV</span>
              <strong className="text-[var(--t-accent)]">
                {formatWadUsd(plan.nav.toString())}
              </strong>
            </div>
            <div className="mt-2 flex flex-wrap justify-between gap-2 text-xs text-[var(--t-muted)]">
              <span>
                Live band{" "}
                {reads.minPackNav === undefined
                  ? "—"
                  : formatWadUsd(reads.minPackNav.toString())}
                {" → "}
                {reads.poolMax === undefined
                  ? "—"
                  : formatWadUsd(reads.poolMax.toString())}
              </span>
              <span
                className={
                  plan.eligible
                    ? "font-bold text-[var(--t-green)]"
                    : "font-bold text-[var(--t-red)]"
                }
              >
                {plan.eligible ? "Inside eligibility band" : "Not eligible"}
              </span>
            </div>
            <p className="mt-2 text-xs text-[var(--t-muted)]">
              {plan.approvals.length === 0
                ? "No token approvals currently required."
                : `Approvals required: ${plan.approvals
                    .map((token) => token.symbol)
                    .join(", ")}`}
            </p>
          </div>

          {isReading && (
            <p className="mt-3 text-xs text-[var(--t-muted)]">
              Refreshing on-chain balances, allowances, quotes, and band…
            </p>
          )}
          {reads.error && (
            <p role="alert" className="mt-3 text-sm text-[var(--t-red)]">
              Chain reads unavailable: {reads.error}
            </p>
          )}
          {showErrors && plan.errors.length > 0 && (
            <ul className="mt-3 space-y-1 text-xs text-[var(--t-red)]">
              {plan.errors.map((error) => (
                <li key={error}>{error}</li>
              ))}
            </ul>
          )}

          <div className="mt-5 flex flex-wrap gap-3">
            <GameButton
              onClick={onSubmit}
              disabled={
                isBusy || isReading || plan.errors.length > 0 || !!mintedTokenId
              }
            >
              {isBusy ? "[TRANSACTION IN PROGRESS]" : "[MINT + ENTER POOL]"}
            </GameButton>
            <GameButton
              onClick={onRefresh}
              disabled={isBusy || isReading}
              variant="secondary"
            >
              [REFRESH CHAIN READS]
            </GameButton>
          </div>

          <p
            role={phase.kind === "error" ? "alert" : "status"}
            className={`mt-4 text-sm ${
              phase.kind === "error"
                ? "text-[var(--t-red)]"
                : phase.kind === "complete"
                  ? "text-[var(--t-green)]"
                  : "text-[var(--t-muted)]"
            }`}
          >
            {transactionPhaseMessage(phase)}
          </p>
          {hash && (
            <a
              className="mt-1 inline-block text-xs text-[var(--t-accent)] underline underline-offset-4"
              href={txExplorerUrl(hash)}
              target="_blank"
              rel="noreferrer"
            >
              View pending transaction
            </a>
          )}

          {mintedTokenId !== null && phase.kind === "error" && (
            <div className="mt-4 border border-[var(--t-amber)]/60 bg-[var(--t-accent-soft)] p-4">
              <p className="text-sm text-[var(--t-amber)]">
                Pack #{mintedTokenId.toString()} was confirmed on-chain. It was
                not rolled back and will not be reminted.
              </p>
              <GameButton
                className="mt-3"
                onClick={onRetryEnrollment}
                disabled={isBusy}
                variant="secondary"
                size="sm"
              >
                [RETRY POOL ENROLLMENT]
              </GameButton>
            </div>
          )}

          {phase.kind === "complete" && (
            <GameButton
              className="mt-4"
              onClick={onComposeAnother}
              variant="secondary"
              size="sm"
            >
              [COMPOSE ANOTHER PACK]
            </GameButton>
          )}

          <p className="mt-3 text-[10px] text-[var(--t-muted)]">
            Wallet {walletAddress.slice(0, 6)}…{walletAddress.slice(-4)} ·{" "}
            <a
              className="hover:underline"
              href={PAYMENT_EXPLORER_URL}
              target="_blank"
              rel="noreferrer"
            >
              Robinhood testnet explorer
            </a>
          </p>
        </>
      )}
    </section>
  );
}

export function PackComposer({ walletAddress }: { walletAddress: Address }) {
  const publicClient = useMemo(() => createRobinhoodPublicClient(), []);
  const { walletReady, getWalletClient } = useMakerTransactionClient(
    walletAddress,
    publicClient
  );
  const journalStorage = useMemo(() => createBrowserJournalStorage(), []);
  const addresses = useMemo(() => {
    try {
      return getContractAddresses();
    } catch {
      return null;
    }
  }, []);
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      ROBINHOOD_TESTNET_STOCK_TOKENS.map((token) => [token.symbol, ""])
    )
  );
  const [reads, setReads] = useState<ChainReads>({ tokens: {} });
  const [phase, setPhase] = useState<TransactionPhase>({ kind: "idle" });
  const [mintedTokenId, setMintedTokenId] = useState<bigint | null>(null);
  const [isReading, setIsReading] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const readSequence = useRef(0);
  const recoveryStarted = useRef(false);
  const valueSignature = ROBINHOOD_TESTNET_STOCK_TOKENS.map(
    (token) => values[token.symbol] ?? ""
  ).join("|");

  const refresh = useCallback(async () => {
    if (!addresses) return null;
    const sequence = ++readSequence.current;
    setIsReading(true);
    const next = await readComposerChainState(
      publicClient,
      addresses,
      walletAddress,
      values
    );
    if (sequence === readSequence.current) {
      setReads(next);
      setIsReading(false);
    }
    return next;
  }, [addresses, publicClient, walletAddress, values]);

  useEffect(() => {
    const timeout = window.setTimeout(() => void refresh(), 250);
    return () => window.clearTimeout(timeout);
  }, [refresh, valueSignature]);

  const plan = useMemo(
    () =>
      buildPackPlan(inputRows(values, reads), reads.minPackNav, reads.poolMax),
    [reads, values]
  );

  async function adapterForConnectedWallet() {
    const walletClient = await getWalletClient();
    if (!addresses) throw new Error("Contract addresses are not configured");
    return makeTransactionAdapter(
      publicClient,
      walletClient,
      walletAddress,
      addresses
    );
  }

  async function resumeWorkflow(workflow: LifecycleWorkflow) {
    const adapter = await adapterForConnectedWallet();
    const tokenId = await createAndEnrollPack(
      workflowPlan(workflow),
      adapter,
      setPhase,
      setMintedTokenId,
      { storage: journalStorage, workflowKey: workflow.key }
    );
    setMintedTokenId(tokenId);
    journalStorage.remove(workflow.key);
    await refresh();
  }

  useEffect(() => {
    if (recoveryStarted.current || !addresses || !walletReady) return;
    const workflow = listWorkflows(
      journalStorage,
      PAYMENT_CHAIN.id,
      walletAddress,
      "create"
    )[0];
    if (!workflow) return;
    recoveryStarted.current = true;
    setIsBusy(true);
    void resumeWorkflow(workflow)
      .catch((error) => {
        setPhase({
          kind: "error",
          message: errorMessage(error, "Pack recovery needs attention"),
          hash:
            error instanceof PendingTransactionError ? error.hash : undefined,
        });
      })
      .finally(() => setIsBusy(false));
    // Recovery is intentionally a one-shot per mount; the explicit retry keeps
    // wallet prompts user-driven after the first reconciliation pass.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addresses, journalStorage, walletAddress, walletReady]);

  async function onSubmit() {
    if (!addresses || isBusy || mintedTokenId !== null) return;
    setIsBusy(true);
    setPhase({ kind: "idle" });
    try {
      const existing = listWorkflows(
        journalStorage,
        PAYMENT_CHAIN.id,
        walletAddress,
        "create"
      )[0];
      if (existing) {
        await resumeWorkflow(existing);
        return;
      }
      const freshReads = await readComposerChainState(
        publicClient,
        addresses,
        walletAddress,
        values
      );
      setReads(freshReads);
      const freshPlan = buildPackPlan(
        inputRows(values, freshReads),
        freshReads.minPackNav,
        freshReads.poolMax
      );
      if (freshPlan.errors.length > 0) {
        throw new Error(freshPlan.errors.join(". "));
      }
      const adapter = await adapterForConnectedWallet();
      const fingerprint = requestFingerprint(
        freshPlan.selected.flatMap((token) => [token.address, token.amount])
      );
      const workflow = ensureWorkflow(journalStorage, {
        chainId: PAYMENT_CHAIN.id,
        wallet: walletAddress,
        kind: "create",
        requestFingerprint: fingerprint,
        context: {
          plan: JSON.stringify(
            freshPlan.selected.map((token) => ({
              ...token,
              amount: token.amount.toString(),
              allowance: token.allowance.toString(),
              quote: token.quote.toString(),
              needsApproval: token.allowance < token.amount,
            }))
          ),
        },
      });
      await createAndEnrollPack(
        freshPlan,
        adapter,
        setPhase,
        setMintedTokenId,
        { storage: journalStorage, workflowKey: workflow.key }
      );
      journalStorage.remove(workflow.key);
      await refresh();
    } catch (error) {
      setPhase({
        kind: "error",
        message: errorMessage(error, "Pack creation failed"),
        hash: error instanceof PendingTransactionError ? error.hash : undefined,
      });
    } finally {
      setIsBusy(false);
    }
  }

  async function onRetryEnrollment() {
    if (mintedTokenId === null || isBusy) return;
    setIsBusy(true);
    try {
      const adapter = await adapterForConnectedWallet();
      const workflow = listWorkflows(
        journalStorage,
        PAYMENT_CHAIN.id,
        walletAddress,
        "create"
      )[0];
      if (!workflow) throw new Error("Saved Pack workflow is unavailable");
      await enrollMintedPack(mintedTokenId, adapter, setPhase, {
        storage: journalStorage,
        workflowKey: workflow.key,
      });
      journalStorage.remove(workflow.key);
      await refresh();
    } catch (error) {
      setPhase({
        kind: "error",
        message: errorMessage(error, "Pool enrollment failed"),
        hash: error instanceof PendingTransactionError ? error.hash : undefined,
      });
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <PackComposerView
      walletAddress={walletAddress}
      values={values}
      reads={reads}
      plan={plan}
      phase={phase}
      mintedTokenId={mintedTokenId}
      isReading={isReading}
      isBusy={isBusy}
      configured={Boolean(addresses)}
      onAmountChange={(symbol, value) => {
        setValues((current) => ({ ...current, [symbol]: value }));
        setReads((current) => ({
          ...current,
          tokens: {
            ...current.tokens,
            [symbol]: {
              ...current.tokens[symbol],
              quote: undefined,
              quoteError: undefined,
            },
          },
        }));
      }}
      onRefresh={() => void refresh()}
      onSubmit={() => void onSubmit()}
      onRetryEnrollment={() => void onRetryEnrollment()}
      onComposeAnother={() => {
        setValues(
          Object.fromEntries(
            ROBINHOOD_TESTNET_STOCK_TOKENS.map((token) => [token.symbol, ""])
          )
        );
        setMintedTokenId(null);
        setPhase({ kind: "idle" });
      }}
    />
  );
}

export type { ChainReads, TokenRead, StockToken };
