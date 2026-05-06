"use client";

import { usePrivy } from "@privy-io/react-auth";
import { useHeadlineDeals } from "@/hooks/use-deals";
import { useUsdcBalance } from "@/hooks/use-usdc-balance";
import { WireDropBlock, type WireDrop } from "./wire-drop";

export type { WireDrop };

export function WireFeed({ drops }: { drops: WireDrop[] }) {
  const { data: headlineDealsMap } = useHeadlineDeals();
  const { authenticated } = usePrivy();
  const { balance } = useUsdcBalance();

  return (
    <div className="divide-y divide-[var(--t-border)]">
      {drops.map((drop) => (
        <WireDropBlock
          key={drop.epoch}
          drop={drop}
          headlineDealsMap={headlineDealsMap}
          authenticated={authenticated}
          balance={balance}
        />
      ))}
    </div>
  );
}
