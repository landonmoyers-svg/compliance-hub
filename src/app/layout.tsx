import type { Metadata, Viewport } from "next";
import { inter } from "./fonts";
import { Providers } from "@/components/providers";
import { AppGate } from "@/components/layout/app-gate";
import { PwaRegister } from "@/components/pwa-register";
import "./globals.css";

export const metadata: Metadata = {
  title: "Compliance Hub",
  description:
    "Healthcare compliance & practice-management platform — credentials, OSHA, HIPAA, HR, and training in one place.",
  applicationName: "Compliance Hub",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "Compliance Hub" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: "#121212",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
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
        <PwaRegister />
      </body>
    </html>
  );
}
