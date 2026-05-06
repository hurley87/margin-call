"use client";

import { usePrivy } from "@privy-io/react-auth";
import { useHeadlineDeals } from "@/hooks/use-deals";
import { useUsdcBalance } from "@/hooks/use-usdc-balance";
import { WirePost } from "./wire-post";

export interface FeedHeadline {
  headline: string;
  body: string;
  category: string;
  epoch: number;
  created_at: string;
  mood: string;
  sec_heat: number;
}

export function WireFeed({ feed }: { feed: FeedHeadline[] }) {
  const { data: headlineDealsMap } = useHeadlineDeals();
  const { authenticated } = usePrivy();
  const { balance } = useUsdcBalance();

  return (
    <div className="divide-y divide-[var(--t-border)]">
      {feed.map((item, i) => (
        <WirePost
          key={`${item.epoch}-${i}`}
          item={item}
          headlineDeals={headlineDealsMap?.[item.headline]}
          authenticated={authenticated}
          balance={balance}
        />
      ))}
    </div>
  );
}
