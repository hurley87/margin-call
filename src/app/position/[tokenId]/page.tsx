import { PositionDetailStub } from "@/components/positions/position-detail-stub";

type PositionPageProps = {
  params: Promise<{ tokenId: string }>;
};

export default async function PositionPage({ params }: PositionPageProps) {
  const { tokenId } = await params;
  return <PositionDetailStub tokenId={tokenId} />;
}
