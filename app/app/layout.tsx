import type { Metadata, Viewport } from "next";
import "./globals.css";

// Public origin used to build absolute URLs for social cards. Override per
// deployment with NEXT_PUBLIC_SITE_URL (must be the canonical https origin —
// scrapers require absolute image URLs).
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://cxch.io";

const TITLE = "cXCH — Wrapped XCH on Chia";
const DESCRIPTION =
  "Wrap XCH into a 1:1 reserve-backed CAT2 token, and melt it back anytime. " +
  "Permissionless, with a consensus-enforced peg — no custodian, no bridge.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: TITLE,
    template: "%s · cXCH",
  },
  description: DESCRIPTION,
  applicationName: "cXCH",
  keywords: [
    "cXCH",
    "Chia",
    "XCH",
    "CAT2",
    "wrapped XCH",
    "DeFi",
    "Chia blockchain",
    "token",
  ],
  authors: [{ name: "cXCH" }],
  alternates: { canonical: "/" },
  icons: {
    icon: "/icon.svg",
    shortcut: "/icon.svg",
    apple: "/icon.svg",
  },
  manifest: "/manifest.webmanifest",
  openGraph: {
    type: "website",
    siteName: "cXCH",
    title: TITLE,
    description: DESCRIPTION,
    url: SITE_URL,
    images: [
      {
        url: "/og.png",
        width: 1200,
        height: 630,
        alt: "cXCH — Wrapped XCH on Chia",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
    images: ["/og.png"],
  },
};

export const viewport: Viewport = {
  themeColor: "#0b0f17",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
