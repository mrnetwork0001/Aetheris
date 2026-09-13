import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono, Montserrat } from "next/font/google";

import { Providers } from "@/components/providers";

import "./globals.css";

const montserrat = Montserrat({
  subsets: ["latin"],
  weight: ["600", "700", "800"],
  display: "swap",
  variable: "--font-montserrat",
});

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
  variable: "--font-inter",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
  variable: "--font-jetbrains",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://aetheris.dev"),
  title: {
    default: "Aetheris - Autonomous DeAI Agency OS",
    template: "%s · Aetheris",
  },
  description:
    "Aetheris is an Autonomous DeAI Agency and Micro-Treasury Operating System: sub-second HTS settlement on Hedera, HCS audit logging, The Graph analytics, World ID governance, 1inch treasury routing, Privy passkey onboarding and ENS agent identity.",
  applicationName: "Aetheris",
  authors: [{ name: "Ifeanyichukwu Onwo" }],
  keywords: [
    "Aetheris",
    "DeAI",
    "Hedera",
    "HCS",
    "HTS",
    "The Graph",
    "World ID",
    "1inch",
    "Privy",
    "ENS",
    "ETHOnline 2026",
  ],
  openGraph: {
    title: "Aetheris - Autonomous DeAI Agency OS",
    description:
      "Launch a self-sustaining AI agency: escrowed client jobs, autonomous sub-agent hiring, and sub-second micro-settlement on Hedera.",
    type: "website",
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: "#000000",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
};

/**
 * Root layout holds only the document shell: fonts, providers and the skip
 * link. Headers, footers and the app sidebar live in the route-group layouts,
 * which must render the `#main` landmark the skip link targets.
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${montserrat.variable} ${inter.variable} ${jetbrainsMono.variable}`}
    >
      <body className="min-h-screen bg-fl-bg text-fl-fg antialiased">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-[10px] focus:bg-white focus:px-4 focus:py-2 focus:font-display focus:text-[0.8rem] focus:font-bold focus:text-black"
        >
          Skip to content
        </a>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
