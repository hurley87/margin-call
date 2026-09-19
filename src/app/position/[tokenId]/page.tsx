import { PositionDetailPage } from "@/components/positions/position-detail-page";

type PositionPageProps = {
  params: Promise<{ tokenId: string }>;
};

export default async function PositionPage({ params }: PositionPageProps) {
  const { tokenId } = await params;
  return (
    <div className="mx-auto w-full max-w-3xl py-8">
      <PositionDetailPage tokenId={tokenId} />
    </div>
  );
}
