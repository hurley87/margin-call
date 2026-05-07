"use client";

import { useMemo, useState } from "react";
import { heatColor } from "@/lib/utils";
import { WireSourceLine } from "./wire-sources";
import { CreateDealDialog } from "./create-deal-dialog";
import { DealBadge } from "./deal-badge";
import type { Deal } from "@/hooks/use-deals";
import type { Id } from "../../../convex/_generated/dataModel";

export interface WireDealSeed {
  seedId: Id<"wireDealSeeds">;
  arcId: Id<"narrativeArcs">;
  prompt: string;
  suggestedPotUsdc: number;
  suggestedEntryCostUsdc: number;
  linkedDealCount: number;
  linkedPotTotalUsdc: number;
}

export interface WireDrop {
  epoch: number;
  epochSlot: number | null;
  dropTitle: string | null;
  topArcTitle: string | null;
  topArcTension: number | null;
  mood: string;
  secHeat: number;
  createdAt: string;
  dispatches: Array<{
    headline: string;
    body: string;
    category: string;
    role: string;
    dispatchKey?: string;
    dealSeed?: WireDealSeed;
  }>;
}

interface WireDispatchProps {
  dispatch: {
    headline: string;
    body: string;
    category: string;
    role: string;
    createdAt: string;
    dealSeed?: WireDealSeed;
  };
  headlineDeals?: Deal[];
}

export function WireDispatch({ dispatch, headlineDeals }: WireDispatchProps) {
  const [dialogOpen, setDialogOpen] = useState(false);

  const dealCount = headlineDeals?.length ?? 0;
  const totalPot = headlineDeals?.reduce((sum, d) => sum + d.pot_usdc, 0) ?? 0;
  const seed = dispatch.dealSeed;

  return (
    <div className="px-3 py-3">
      <WireSourceLine
        category={dispatch.category}
        createdAt={dispatch.createdAt}
      />

      <p className="mt-1 text-sm font-bold leading-snug text-[var(--t-text)]">
        {dispatch.headline}
      </p>

      <p className="mt-1 text-xs leading-relaxed text-[var(--t-muted)]">
        {dispatch.body}
      </p>

      {headlineDeals && headlineDeals.length > 0 && (
        <div className="mt-2 flex flex-col gap-1">
          {headlineDeals.map((d) => (
            <DealBadge key={d.id} deal={d} />
          ))}
        </div>
      )}

      <div className="mt-2 flex items-center justify-between">
        <button
          onClick={() => setDialogOpen(true)}
          className={
            seed
              ? "flex items-center gap-1.5 border border-[var(--t-accent)] px-3 py-1 text-[11px] font-bold text-[var(--t-accent)] transition-colors hover:bg-[var(--t-accent)] hover:text-[var(--t-bg)]"
              : "text-[10px] text-[var(--t-muted)] transition-colors hover:text-[var(--t-accent)]"
          }
        >
          {seed ? "$ CREATE DEAL FROM THIS" : "USE AS PREMISE →"}
        </button>

        {seed && (
          <span className="text-[10px] text-[var(--t-muted)]">
            POT ${seed.suggestedPotUsdc.toFixed(2)} · ENTRY $
            {seed.suggestedEntryCostUsdc.toFixed(2)}
          </span>
        )}
        {!seed && dealCount > 0 && (
          <span className="text-[10px] text-[var(--t-muted)]">
            {dealCount} {dealCount === 1 ? "deal" : "deals"} · $
            {totalPot.toFixed(2)} pot
          </span>
        )}
      </div>

      {seed && seed.linkedDealCount > 0 && (
        <div className="mt-1 text-[10px] text-[var(--t-muted)]">
          LINKED {seed.linkedDealCount}{" "}
          {seed.linkedDealCount === 1 ? "DEAL" : "DEALS"} · $
          {seed.linkedPotTotalUsdc.toFixed(2)} POT
        </div>
      )}

      {dialogOpen && (
        <CreateDealDialog
          headline={{ headline: dispatch.headline, body: dispatch.body }}
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          dealSeed={
            seed
              ? {
                  seedId: seed.seedId,
                  prompt: seed.prompt,
                  suggestedPotUsdc: seed.suggestedPotUsdc,
                  suggestedEntryCostUsdc: seed.suggestedEntryCostUsdc,
                }
              : undefined
          }
        />
      )}
    </div>
  );
}

interface WireDropBlockProps {
  drop: WireDrop;
  headlineDealsMap?: Record<string, Deal[]>;
}

export function WireDropBlock({ drop, headlineDealsMap }: WireDropBlockProps) {
  const timeStr = useMemo(
    () =>
      new Date(drop.createdAt).toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
        timeZone: "America/New_York",
      }) + " ET",
    [drop.createdAt]
  );

  const tensionColor = heatColor(drop.topArcTension ?? 0);

  return (
    <div className="my-3 border border-[var(--t-border)]">
      <div className="border-b border-[var(--t-border)] px-3 py-1.5">
        <div className="flex items-center gap-1.5 text-[11px]">
          <span className="font-bold text-[var(--t-accent)]">WIRE DROP</span>
          <span className="text-[var(--t-muted)]">·</span>
          <span className="text-[var(--t-muted)]">{timeStr}</span>
          {drop.dropTitle && (
            <>
              <span className="text-[var(--t-muted)]">·</span>
              <span className="font-bold text-[var(--t-text)]">
                {drop.dropTitle.toUpperCase()}
              </span>
            </>
          )}
        </div>
        {drop.topArcTitle && (
          <div className="mt-0.5 text-[10px] text-[var(--t-muted)]">
            ARC:{" "}
            <span className="text-[var(--t-text)]">{drop.topArcTitle}</span>
            {drop.topArcTension != null && (
              <>
                {" · "}TENSION{" "}
                <span className={tensionColor}>{drop.topArcTension}/10</span>
              </>
            )}
          </div>
        )}
      </div>

      {drop.dispatches.map((dispatch, i) => (
        <div
          key={`${drop.epoch}-${i}`}
          className={i > 0 ? "border-t border-[var(--t-border)]" : ""}
        >
          <WireDispatch
            dispatch={{ ...dispatch, createdAt: drop.createdAt }}
            headlineDeals={headlineDealsMap?.[dispatch.headline]}
          />
        </div>
      ))}
    </div>
  );
}
