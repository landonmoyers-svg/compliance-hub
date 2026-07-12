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
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f7fb" },
    { media: "(prefers-color-scheme: dark)", color: "#121212" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

// Applies the saved (or system) appearance before first paint to avoid a flash.
const themeInit = `(function(){try{var t=localStorage.getItem('theme')||'system';var d=t==='dark'||(t==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.setAttribute('data-theme',d?'dark':'light');}catch(e){document.documentElement.setAttribute('data-theme','dark');}})();`;

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${inter.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
      </head>
      <body className="min-h-full">
        <Providers>
          <AppGate>{children}</AppGate>
        </Providers>
        <PwaRegister />
      </body>
    </html>
  );
}
