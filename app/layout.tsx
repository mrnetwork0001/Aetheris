import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";

import { Providers } from "@/components/providers";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { Starfield } from "@/components/starfield";

import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-jetbrains",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://aetheris.dev"),
  title: {
    default: "Aetheris — Autonomous DeAI Agency OS",
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
    title: "Aetheris — Autonomous DeAI Agency OS",
    description:
      "Launch a self-sustaining AI agency: escrowed client jobs, autonomous sub-agent hiring, and sub-second micro-settlement on Hedera.",
    type: "website",
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: "#05060f",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${jetbrainsMono.variable}`}>
      <body className="min-h-screen bg-aether-void text-slate-300 antialiased">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-lg focus:bg-aether-glow focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-white"
        >
          Skip to content
        </a>
        <Providers>
          <Starfield />
          <div className="relative z-10 flex min-h-screen flex-col">
            <SiteHeader />
            <main id="main" className="flex-1">
              {children}
            </main>
            <SiteFooter />
          </div>
        </Providers>
      </body>
    </html>
  );
}
