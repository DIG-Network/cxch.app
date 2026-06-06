import type { Metadata, Viewport } from "next";
import "./globals.css";

// Public origin used to build absolute URLs for social cards. Override per
// deployment with NEXT_PUBLIC_SITE_URL (must be the canonical https origin —
// scrapers require absolute image URLs).
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://cxch.app";

const TITLE = "cMojo — Wrapped XCH on Chia";
const DESCRIPTION =
  "Wrap XCH into a 1:1-backed CAT2 token with the XCH embedded inside the coin, " +
  "and melt it back to native XCH anytime. Permissionless, with a " +
  "consensus-enforced peg — no reserve, no custodian, no bridge.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: TITLE,
    template: "%s · cMojo",
  },
  description: DESCRIPTION,
  applicationName: "cMojo",
  keywords: [
    "cMojo",
    "Chia",
    "XCH",
    "CAT2",
    "wrapped XCH",
    "DeFi",
    "Chia blockchain",
    "token",
  ],
  authors: [{ name: "cMojo" }],
  alternates: { canonical: "/" },
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-16.png", sizes: "16x16", type: "image/png" },
    ],
    shortcut: "/favicon.svg",
    apple: "/apple-touch-icon.png",
  },
  manifest: "/manifest.webmanifest",
  openGraph: {
    type: "website",
    siteName: "cMojo",
    title: TITLE,
    description: DESCRIPTION,
    url: SITE_URL,
    images: [
      {
        url: "/og.png",
        width: 1200,
        height: 630,
        alt: "cMojo — Wrapped XCH on Chia",
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
