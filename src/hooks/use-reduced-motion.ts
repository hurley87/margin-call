"use client";

import { useEffect, useState } from "react";

/**
 * Subscribes to prefers-reduced-motion. Degrades to false when matchMedia is
 * unavailable (jsdom / SSR) so animated clients are the default there.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  return reduced;
}
