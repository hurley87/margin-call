"use client";

import { useState } from "react";
import { useQuery, useAction } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { Nav } from "@/components/nav";
import { heatColor, relativeTime } from "@/lib/utils";

export default function WireAdminClient() {
  const ctx = useQuery(api.wire.operatorQueries.getOperatorContext);

  const forceGenerate = useAction(api.wire.operatorActions.forceGenerateDrop);
  const resetState = useAction(api.wire.operatorActions.resetNarrativeState);

  const [generateStatus, setGenerateStatus] = useState<string | null>(null);
  const [generatePending, setGeneratePending] = useState(false);
  const [resetStatus, setResetStatus] = useState<string | null>(null);
  const [resetPending, setResetPending] = useState(false);
  const [resetConfirm, setResetConfirm] = useState(false);

  if (ctx === undefined) {
    return (
      <div className="min-h-screen bg-[var(--t-bg)] font-mono">
        <Nav />
        <div className="flex items-center justify-center pt-24">
          <p className="text-sm text-[var(--t-muted)]">
            LOADING<span className="cursor-blink">{"█"}</span>
          </p>
        </div>
      </div>
    );
  }

  if (!ctx.isOperator) {
    return (
      <div className="min-h-screen bg-[var(--t-bg)] font-mono">
        <Nav />
        <div className="flex items-center justify-center pt-24">
          <div className="border border-[var(--t-red)] px-8 py-6 text-center">
            <p className="text-sm uppercase tracking-widest text-[var(--t-red)]">
              ACCESS DENIED
            </p>
            <p className="mt-2 text-xs text-[var(--t-muted)]">
              Operator subjects only.
            </p>
          </div>
        </div>
      </div>
    );
  }

  async function handleForceGenerate() {
    setGeneratePending(true);
    setGenerateStatus(null);
    try {
      const result = await forceGenerate({});
      if ("skipped" in result) {
        setGenerateStatus(`SKIPPED — ${result.skipped}`);
      } else {
        setGenerateStatus(
          `OK — epoch ${result.epoch ?? "?"} · drop ${result.dropId.slice(-6)}`
        );
      }
    } catch (err) {
      setGenerateStatus(
        `ERROR — ${err instanceof Error ? err.message : String(err)}`
      );
    } finally {
      setGeneratePending(false);
    }
  }

  async function handleReset() {
    if (!resetConfirm) {
      setResetConfirm(true);
      return;
    }
    setResetPending(true);
    setResetStatus(null);
    setResetConfirm(false);
    try {
      const result = await resetState({});
      const c = result.cleared;
      setResetStatus(
        `OK — deleted ${c.deletedNarratives} drops · ${c.deletedSeeds} seeds · ${c.deletedSeedLinks} links · season re-imported`
      );
    } catch (err) {
      setResetStatus(
        `ERROR — ${err instanceof Error ? err.message : String(err)}`
      );
    } finally {
      setResetPending(false);
    }
  }

  return (
    <div className="min-h-screen bg-[var(--t-bg)] font-mono">
      <Nav />

      <div className="mx-auto w-full max-w-4xl px-4">
        <div className="border-x border-[var(--t-border)]">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-[var(--t-border)] px-4 py-2">
            <div className="flex items-center gap-3">
              <span className="text-xs uppercase tracking-widest text-[var(--t-accent)]">
                OPS CONSOLE
              </span>
              {ctx.season && (
                <span className="text-xs text-[var(--t-muted)]">
                  {ctx.season.title}
                </span>
              )}
            </div>
            <div className="flex items-center gap-4 text-xs text-[var(--t-muted)]">
              <span>
                DROPS{" "}
                <span className="text-[var(--t-text)]">
                  {ctx.recentDropCount}
                </span>
              </span>
              {ctx.lastDrop && (
                <span>
                  LAST{" "}
                  <span className="text-[var(--t-text)]">
                    {relativeTime(ctx.lastDrop.createdAt)}
                  </span>
                </span>
              )}
            </div>
          </div>

          <div className="divide-y divide-[var(--t-border)]">
            {/* Force Generate */}
            <section className="px-4 py-4">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-[10px] uppercase tracking-widest text-[var(--t-muted)]">
                  WIRE GENERATOR
                </span>
              </div>
              <div className="flex items-center gap-4">
                <button
                  onClick={handleForceGenerate}
                  disabled={generatePending}
                  className="cursor-pointer border border-[var(--t-accent)] bg-[var(--t-accent)] px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-[var(--t-bg)] transition-colors hover:bg-transparent hover:text-[var(--t-accent)] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {generatePending ? "GENERATING..." : "FORCE GENERATE DROP"}
                </button>
                {generateStatus && (
                  <span
                    className={`text-xs ${
                      generateStatus.startsWith("ERROR")
                        ? "text-[var(--t-red)]"
                        : generateStatus.startsWith("SKIPPED")
                          ? "text-[var(--t-amber)]"
                          : "text-[var(--t-green)]"
                    }`}
                  >
                    {generateStatus}
                  </span>
                )}
              </div>
              <p className="mt-2 text-[10px] text-[var(--t-muted)]">
                Bypasses market-hours gate. Writes a distinct row
                (ignoreSlot=true).
              </p>
            </section>

            {/* Arc Inspector */}
            <section className="px-4 py-4">
              <div className="mb-3">
                <span className="text-[10px] uppercase tracking-widest text-[var(--t-muted)]">
                  ACTIVE ARCS ({ctx.arcs.length})
                </span>
              </div>

              {ctx.arcs.length === 0 ? (
                <p className="text-xs text-[var(--t-muted)]">
                  No active arcs — import a season first.
                </p>
              ) : (
                <div className="divide-y divide-[var(--t-border)]">
                  {ctx.arcs.map((arc) => (
                    <div key={arc._id} className="py-3">
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-[var(--t-text)]">
                              {arc.title}
                            </span>
                            <span className="text-[10px] text-[var(--t-muted)]">
                              [{arc.slug}]
                            </span>
                          </div>
                          <p className="mt-0.5 text-[10px] leading-relaxed text-[var(--t-muted)]">
                            {arc.summary}
                          </p>
                          {arc.entities.length > 0 && (
                            <div className="mt-1 flex flex-wrap gap-1.5">
                              {arc.entities.map((e) => (
                                <span
                                  key={e.slug}
                                  className="border border-[var(--t-border)] px-1 py-0.5 text-[9px] uppercase tracking-wider text-[var(--t-muted)]"
                                >
                                  {e.displayName}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                        <div className="shrink-0 text-right">
                          <div className="flex items-center justify-end gap-2">
                            {arc.phase && (
                              <span className="border border-[var(--t-border)] px-1 py-0.5 text-[9px] uppercase tracking-wider text-[var(--t-muted)]">
                                {arc.phase}
                              </span>
                            )}
                            <span
                              className={`text-sm font-bold tabular-nums ${heatColor(arc.tensionScore)}`}
                            >
                              {arc.tensionScore}/10
                            </span>
                          </div>
                          <div className="mt-0.5 text-[9px] text-[var(--t-muted)]">
                            {relativeTime(arc.lastTouchedAt)}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Dev Reset */}
            {ctx.isDevEnv && (
              <section className="px-4 py-4">
                <div className="mb-3">
                  <span className="text-[10px] uppercase tracking-widest text-[var(--t-muted)]">
                    DEV RESET
                  </span>
                </div>
                <div className="border border-[var(--t-red)]/30 p-3">
                  <p className="mb-3 text-[10px] leading-relaxed text-[var(--t-muted)]">
                    Deletes all Wire Drops, Deal Seeds, and Seed Links, then
                    re-imports the active season (resets arc tensions to seed
                    values).{" "}
                    <span className="text-[var(--t-red)]">
                      Irreversible in dev.
                    </span>
                  </p>
                  <div className="flex items-center gap-4">
                    <button
                      onClick={handleReset}
                      disabled={resetPending}
                      className={`cursor-pointer border px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                        resetConfirm
                          ? "border-[var(--t-red)] bg-[var(--t-red)] text-[var(--t-bg)] hover:bg-transparent hover:text-[var(--t-red)]"
                          : "border-[var(--t-red)]/50 text-[var(--t-red)] hover:border-[var(--t-red)] hover:bg-[var(--t-red)]/10"
                      }`}
                    >
                      {resetPending
                        ? "RESETTING..."
                        : resetConfirm
                          ? "CONFIRM RESET"
                          : "RESET NARRATIVE STATE"}
                    </button>
                    {resetConfirm && !resetPending && (
                      <button
                        onClick={() => setResetConfirm(false)}
                        className="cursor-pointer text-[10px] uppercase tracking-wider text-[var(--t-muted)] hover:text-[var(--t-text)]"
                      >
                        CANCEL
                      </button>
                    )}
                    {resetStatus && (
                      <span
                        className={`text-xs ${
                          resetStatus.startsWith("ERROR")
                            ? "text-[var(--t-red)]"
                            : "text-[var(--t-green)]"
                        }`}
                      >
                        {resetStatus}
                      </span>
                    )}
                  </div>
                </div>
              </section>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
