"use client";

import { useCallback, useLayoutEffect, useRef } from "react";

import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { DUR, EASE } from "@/lib/motion-tokens";

/** Invert to the old position instantly, then release to animate (FLIP). */
function invertAndRelease(element: HTMLElement, deltaY: number) {
  element.style.transition = "none";
  element.style.transform = `translateY(${deltaY}px)`;
  requestAnimationFrame(() => {
    element.style.transition = `transform ${DUR.slow}ms ${EASE.out}`;
    element.style.transform = "";
  });
}

/**
 * Library-free FLIP for a vertically ordered list: when the id order changes,
 * moved rows glide from their previous position to the new one. Value-only
 * updates (same order) never measure or animate. Measures `offsetTop` so
 * scrolling the container doesn't fake movement.
 */
export function useFlipList(orderedIds: readonly string[]): {
  registerRow: (id: string) => (element: HTMLElement | null) => void;
} {
  const elementsRef = useRef(new Map<string, HTMLElement>());
  const positionsRef = useRef(new Map<string, number>());
  const signatureRef = useRef<string | null>(null);
  const reducedMotion = useReducedMotion();

  const registerRow = useCallback(
    (id: string) => (element: HTMLElement | null) => {
      if (element) elementsRef.current.set(id, element);
      else elementsRef.current.delete(id);
    },
    []
  );

  const signature = orderedIds.join("\n");

  useLayoutEffect(() => {
    const previousSignature = signatureRef.current;
    if (previousSignature === signature) return;
    signatureRef.current = signature;

    const elements = elementsRef.current;

    if (previousSignature !== null && !reducedMotion) {
      for (const [id, element] of elements) {
        const previousTop = positionsRef.current.get(id);
        if (previousTop === undefined) continue;
        const delta = previousTop - element.offsetTop;
        if (delta === 0) continue;
        invertAndRelease(element, delta);
      }
    }

    const nextPositions = new Map<string, number>();
    for (const [id, element] of elements) {
      nextPositions.set(id, element.offsetTop);
    }
    positionsRef.current = nextPositions;
  }, [signature, reducedMotion]);

  return { registerRow };
}
