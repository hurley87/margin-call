"use client";

import { useParams } from "next/navigation";
import { TraderDetailContent } from "@/components/trader-detail";

export default function TraderDetailPage() {
  const { id } = useParams<{ id: string }>();
  return <TraderDetailContent id={id} />;
}
