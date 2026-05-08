"use client";

import { useParams } from "next/navigation";

import { DealDetailContent } from "@/components/deal-detail";
import { Nav } from "@/components/nav";

export default function DealDetailPage() {
  const { id } = useParams<{ id: string }>();

  return (
    <div className="crt-scanlines min-h-screen bg-[var(--t-bg)] font-mono">
      <Nav />

      <div className="mx-auto w-full max-w-4xl px-4">
        <div className="border-x border-[var(--t-border)]">
          <DealDetailContent dealId={id} />
        </div>
      </div>
    </div>
  );
}
