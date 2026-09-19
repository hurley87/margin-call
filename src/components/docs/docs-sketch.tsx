"use client";

import { DrawablyCard, DrawablyCircle, DrawablyDivider } from "drawably/react";
import type { ReactNode } from "react";

export function DocsDivider() {
  return (
    <DrawablyDivider
      className="docs-divider"
      seed={41}
      roughness={0.5}
      boil={0}
      stroke="var(--t-border)"
    />
  );
}

export function DocsStepNumber({ children }: { children: ReactNode }) {
  return (
    <DrawablyCircle
      className="docs-step-number"
      seed={23}
      roughness={0.7}
      boil={0}
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
      boil={0}
      stroke="var(--t-border)"
    >
      {children}
    </DrawablyCard>
  );
}
