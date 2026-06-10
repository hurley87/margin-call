"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

import { AnimatedNumber } from "@/components/animated-number";
import { useMoments } from "@/hooks/use-moments";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { DUR } from "@/lib/motion-tokens";
import type { Moment, MomentActivitySource, MomentKind } from "@/lib/moments";
import { cn, formatSignedMoney } from "@/lib/utils";

const KIND_COPY: Record<
  MomentKind,
  { label: string; title: (name: string) => string; tone: "up" | "down" }
> = {
  wipeout: {
    label: "MARGIN CALL",
    title: (name) => `${name} WIPED OUT`,
    tone: "down",
  },
  win: {
    label: "POSITION CLOSED",
    title: (name) => `${name} WINS BIG`,
    tone: "up",
  },
  loss: {
    label: "POSITION CLOSED",
    title: (name) => `${name} TAKES A HIT`,
    tone: "down",
  },
};

/**
 * Mounts the ceremony system: watches desk activity for wipeouts and big
 * wins/losses, and plays one full-screen moment at a time. Render once on
 * the dashboard beside the toast layer.
 */
export function MomentLayer({
  activity,
  traderNames,
  onWin,
  onLoss,
  onWipeout,
}: {
  activity: readonly MomentActivitySource[] | undefined;
  traderNames: Record<string, string>;
  onWin: () => void;
  onLoss: () => void;
  onWipeout: () => void;
}) {
  const { current, dismiss } = useMoments({ activity, traderNames });

  if (current === null) return null;

  return (
    <MomentOverlay
      key={current.id}
      moment={current}
      onDone={dismiss}
      onReveal={
        current.kind === "wipeout"
          ? onWipeout
          : current.kind === "win"
            ? onWin
            : onLoss
      }
    />
  );
}

function MomentOverlay({
  moment,
  onDone,
  onReveal,
}: {
  moment: Moment;
  onDone: () => void;
  onReveal: () => void;
}) {
  const reducedMotion = useReducedMotion();
  const [revealed, setRevealed] = useState(reducedMotion);

  useEffect(() => {
    const revealTimer = setTimeout(
      () => {
        setRevealed(true);
        onReveal();
      },
      reducedMotion ? 0 : DUR.suspense
    );
    const doneTimer = setTimeout(
      onDone,
      reducedMotion ? DUR.ceremonyReduced : DUR.ceremony
    );
    return () => {
      clearTimeout(revealTimer);
      clearTimeout(doneTimer);
    };
  }, [onDone, onReveal, reducedMotion]);

  const copy = KIND_COPY[moment.kind];
  const toneColor =
    copy.tone === "up" ? "var(--t-green-hot)" : "var(--t-red-hot)";

  return createPortal(
    <div
      role="status"
      aria-live="assertive"
      className="mc-moment pointer-events-none fixed inset-0 z-[80]"
      style={{ "--mc-moment-color": toneColor } as React.CSSProperties}
    >
      <div className="mc-moment-backdrop absolute inset-0 bg-black/45" />
      {revealed && <div className="mc-moment-edge absolute inset-0" />}
      <div className="absolute inset-0 grid place-items-center px-4">
        <div
          className={cn(
            "mc-moment-card min-w-[18rem] max-w-xl border bg-[var(--t-bg)]/95 px-8 py-6 text-center font-mono shadow-2xl shadow-black/70",
            revealed && moment.kind === "wipeout" && "mc-shake",
            copy.tone === "up"
              ? "border-[var(--t-green)]/70"
              : "border-[var(--t-red)]/70"
          )}
        >
          <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[var(--t-muted)]">
            {revealed ? copy.label : "FLOOR REPORT // INCOMING"}
          </p>
          <h2
            className="mt-2 font-[family-name:var(--font-plex-sans)] text-2xl font-black uppercase tracking-wide sm:text-3xl"
            style={{ color: revealed ? toneColor : "var(--t-amber)" }}
          >
            {revealed ? copy.title(moment.traderName) : `${moment.traderName}`}
            {!revealed && <span className="cursor-blink">█</span>}
          </h2>
          {moment.amountUsdc !== undefined && (
            <p className="mt-3 text-xl font-black tabular-nums sm:text-2xl">
              <AnimatedNumber
                value={revealed ? moment.amountUsdc : 0}
                format={formatSignedMoney}
                className={
                  copy.tone === "up"
                    ? "text-[var(--t-green-hot)]"
                    : "text-[var(--t-red-hot)]"
                }
                flash="none"
                live
              />
            </p>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
