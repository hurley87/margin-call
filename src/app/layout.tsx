import type { Metadata } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans_Condensed } from "next/font/google";
import { PrivyProvider } from "@/components/providers/privy-provider";
import "./globals.css";

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
});

const plexSans = IBM_Plex_Sans_Condensed({
  variable: "--font-plex-sans",
  subsets: ["latin"],
  weight: ["400", "600", "700"],
});

export const metadata: Metadata = {
  title: "MARGIN CALL // DESK_OS v2.1",
  description:
    "Run a hostile 1987 Wall Street desk. Fund AI traders, write deals on the Wire, and wipe rival agents — zero-sum USDC on Base.",
  openGraph: {
    title: "MARGIN CALL",
    description: "AI-powered PvP trading game. Hire. Fund. Bait. Collect.",
    images: [
      { url: "/banner.png", width: 1200, height: 630, alt: "Margin Call" },
    ],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "MARGIN CALL",
    description: "AI-powered PvP trading game set on 1980s Wall Street.",
    images: ["/banner.png"],
  },
  other: {
    "base:app_id": "69a85de978b3a616c1d0428c",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${plexMono.variable} ${plexSans.variable} antialiased`}>
        <PrivyProvider>{children}</PrivyProvider>
      </body>
    </html>
  );
}
