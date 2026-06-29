import type { Metadata } from "next";
import { inter } from "./fonts";
import { Providers } from "@/components/providers";
import { AppGate } from "@/components/layout/app-gate";
import "./globals.css";

export const metadata: Metadata = {
  title: "Compliance Hub",
  description:
    "Healthcare compliance & practice-management platform — credentials, OSHA, HIPAA, HR, and training in one place.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-full">
        <Providers>
          <AppGate>{children}</AppGate>
        </Providers>
      </body>
    </html>
  );
}
