import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "HomeVault — the keys to the kingdom, safely",
  description:
    "A zero-knowledge household vault and estate-handover coach. Secure the documents your family needs, and make sure the right people can access them at the right time.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
