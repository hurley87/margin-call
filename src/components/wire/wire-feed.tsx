"use client";

import { useHeadlineDeals } from "@/hooks/use-deals";
import { WireDropBlock, type WireDrop } from "./wire-drop";

export type { WireDrop };

export function WireFeed({ drops }: { drops: WireDrop[] }) {
  const { data: headlineDealsMap } = useHeadlineDeals();

  return (
    <div className="divide-y divide-[var(--t-border)]">
      {drops.map((drop) => (
        <WireDropBlock
          key={drop.epoch}
          drop={drop}
          headlineDealsMap={headlineDealsMap}
        />
      ))}
    </div>
  );
}
