import type { Metadata } from "next";
import { Nunito_Sans } from "next/font/google";
import "./globals.css";

/**
 * Jane's type is a humanist sans with open, slightly rounded letterforms —
 * friendly without being soft. Nunito Sans is the closest widely-available
 * match.
 *
 * Loaded through next/font so it is self-hosted and built into the bundle: no
 * request to Google at runtime. That matters for an app whose whole argument is
 * that nothing about your documents leaves the machine — a font that phones
 * home on every page load would undercut it.
 */
const appFont = Nunito_Sans({
  subsets: ["latin"],
  weight: ["300", "400", "600", "700"],
  variable: "--font-app",
  display: "swap",
});

export const metadata: Metadata = {
  title: "HomeVault — the keys to the kingdom, safely",
  description:
    "A zero-knowledge household vault and estate-handover coach. Secure the documents your family needs, and make sure the right people can access them at the right time.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={appFont.variable}>
      <body>{children}</body>
    </html>
  );
}
