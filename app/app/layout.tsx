import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "wXCH — Wrapped XCH",
  description: "Wrap and melt XCH as a 1:1 CAT2 token on Chia.",
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
