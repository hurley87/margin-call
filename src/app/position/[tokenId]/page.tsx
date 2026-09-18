import { PositionDetailPage } from "@/components/positions/position-detail-page";

type PositionPageProps = {
  params: Promise<{ tokenId: string }>;
};

export default async function PositionPage({ params }: PositionPageProps) {
  const { tokenId } = await params;
  return <PositionDetailPage tokenId={tokenId} />;
}
