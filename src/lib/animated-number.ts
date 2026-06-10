/**
 * Pure tween logic for the AnimatedNumber component, extracted for unit
 * testing. A tween rolls a displayed number from `from` to `to` over
 * `durationMs`; retargeting mid-flight starts a new tween from the current
 * eased position so rapid successive updates converge instead of queueing.
 */

export type NumberTween = {
  from: number;
  to: number;
  startedAt: number;
  durationMs: number;
};

export function easeOutCubic(t: number): number {
  const clamped = Math.min(1, Math.max(0, t));
  return 1 - Math.pow(1 - clamped, 3);
}

export function sampleTween(
  tween: NumberTween,
  nowMs: number
): { value: number; done: boolean } {
  const elapsed = nowMs - tween.startedAt;
  if (elapsed >= tween.durationMs) {
    return { value: tween.to, done: true };
  }
  const progress = easeOutCubic(elapsed / tween.durationMs);
  return {
    value: tween.from + (tween.to - tween.from) * progress,
    done: false,
  };
}

export function retargetTween(
  current: NumberTween | null,
  nowMs: number,
  nextValue: number,
  durationMs: number
): NumberTween {
  const from = current ? sampleTween(current, nowMs).value : nextValue;
  return { from, to: nextValue, startedAt: nowMs, durationMs };
}

export type FlashDirection = "up" | "down";

/**
 * Direction of a value change, or null when the change is not visible after
 * formatting (e.g. sub-cent drift or an `updatedAt`-only recompute) and
 * should not animate at all.
 */
export function visibleChangeDirection(
  prev: number,
  next: number,
  format: (n: number) => string
): FlashDirection | null {
  if (format(prev) === format(next)) return null;
  return next > prev ? "up" : "down";
}
