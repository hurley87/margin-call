"use client";

import { DrawablyCard, DrawablyCircle, DrawablyDivider } from "drawably/react";
import type { ReactNode } from "react";

/**
 * Client island for the docs page.
 *
 * Drawably is client-only, so these wrappers exist to keep `/docs` itself a
 * Server Component that can export route metadata. They pin the shared stroke
 * and a stable seed — a seed that changed per render would re-draw the sketch
 * on every hydration.
 */
const SKETCH = { boil: 0, stroke: "var(--t-border)" } as const;

export function DocsDivider() {
  return (
    <DrawablyDivider
      className="docs-divider"
      seed={41}
      roughness={0.5}
      {...SKETCH}
    />
  );
}

export function DocsStepNumber({ children }: { children: ReactNode }) {
  return (
    <DrawablyCircle
      className="docs-step-number"
      seed={23}
      roughness={0.7}
      {...SKETCH}
    >
      {children}
    </DrawablyCircle>
  );
}

export function DocsAssetCard({ children }: { children: ReactNode }) {
  return (
    <DrawablyCard
      className="docs-asset-card"
      seed={37}
      roughness={0.6}
      {...SKETCH}
    >
      {children}
    </DrawablyCard>
  );
}
