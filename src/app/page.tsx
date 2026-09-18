import { MyPositionsPage } from "@/components/positions/my-positions-page";

type HomePageProps = {
  searchParams: Promise<{ opened?: string | string[] }>;
};

export default async function Home({ searchParams }: HomePageProps) {
  const { opened } = await searchParams;
  return (
    <MyPositionsPage
      openedTokenId={typeof opened === "string" ? opened : undefined}
    />
  );
}
