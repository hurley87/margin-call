"use client";

import { useEffect, useRef, useState } from "react";

import {
  retargetTween,
  sampleTween,
  visibleChangeDirection,
  type FlashDirection,
  type NumberTween,
} from "@/lib/animated-number";
import { DUR } from "@/lib/motion-tokens";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { cn } from "@/lib/utils";

/**
 * Renders a number that never silently swaps: changes roll odometer-style
 * to the new value and flash green (up) or red (down). Animation is gated on
 * the *formatted* output changing, so reactive recomputes that don't move the
 * displayed value (e.g. `updatedAt`-only bumps) render nothing.
 */
export function AnimatedNumber({
  value,
  format,
  className,
  live = false,
  flash = "auto",
}: {
  value: number;
  /** Formatter for display, e.g. formatMoney / formatCompactMoney / formatUsdc. */
  format: (n: number) => string;
  className?: string;
  /** Apply the hot phosphor live-data treatment (.mc-live-value). */
  live?: boolean;
  /** "auto" flashes green/red by delta direction; "none" rolls silently. */
  flash?: "auto" | "none";
}) {
  const [display, setDisplay] = useState(value);
  const [lastValue, setLastValue] = useState(value);
  const [tweenTarget, setTweenTarget] = useState<number | null>(null);
  const [flashState, setFlashState] = useState<{
    key: number;
    dir: FlashDirection;
  } | null>(null);

  const tweenRef = useRef<NumberTween | null>(null);
  const rafRef = useRef<number | null>(null);
  const reducedMotion = useReducedMotion();

  // Render-phase adjustment (the documented pattern for reacting to prop
  // changes): diff against the previous value and decide whether to flash,
  // tween, or swap silently. First mount never enters this branch.
  if (value !== lastValue) {
    const dir = visibleChangeDirection(lastValue, value, format);
    setLastValue(value);
    if (dir !== null && flash === "auto") {
      setFlashState((current) => ({ key: (current?.key ?? 0) + 1, dir }));
    }
    if (dir === null || reducedMotion) {
      // Invisible after formatting, or reduced motion: no odometer roll.
      // A tween already in flight lands within the same formatted output.
      setDisplay(value);
    } else {
      setTweenTarget(value);
    }
  }

  useEffect(() => {
    if (tweenTarget === null) return;
    tweenRef.current = retargetTween(
      tweenRef.current,
      performance.now(),
      tweenTarget,
      DUR.number
    );
    if (rafRef.current !== null) return;
    const tick = () => {
      const tween = tweenRef.current;
      if (!tween) {
        rafRef.current = null;
        return;
      }
      const sample = sampleTween(tween, performance.now());
      setDisplay(sample.value);
      if (sample.done) {
        tweenRef.current = null;
        rafRef.current = null;
        return;
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }, [tweenTarget]);

  useEffect(
    () => () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    },
    []
  );

  const text = format(display);

  return (
    <span className={cn("tabular-nums", live && "mc-live-value", className)}>
      {flashState ? (
        <span
          key={flashState.key}
          data-dir={flashState.dir}
          className="mc-num-flash"
        >
          {text}
        </span>
      ) : (
        text
      )}
    </span>
  );
}
