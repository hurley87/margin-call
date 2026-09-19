import type { Metadata } from "next";
import { AllPositionsPage } from "@/components/positions/all-positions-page";
import "./explore.css";

export const metadata: Metadata = {
  title: "Explore | Margin Call",
  description: "Discover onchain stock positions on Base.",
};

export default function PositionsRoute() {
  return <AllPositionsPage />;
}
