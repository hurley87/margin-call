import type { Metadata } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans_Condensed } from "next/font/google";
import { MarginCallPrivyProvider } from "@/components/providers/privy-provider";
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
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"
  ),
  title: "MARGIN CALL",
  description:
    "A shared-round Crash game with pre-committed encrypted outcomes on Base Sepolia.",
  openGraph: {
    title: "MARGIN CALL",
    description:
      "A shared-round Crash game with pre-committed encrypted outcomes on Base Sepolia.",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "MARGIN CALL",
    description:
      "A shared-round Crash game with pre-committed encrypted outcomes on Base Sepolia.",
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
        <MarginCallPrivyProvider>{children}</MarginCallPrivyProvider>
      </body>
    </html>
  );
}
