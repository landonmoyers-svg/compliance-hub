"use client";

import { useEffect, useState } from "react";
import { X, Share } from "lucide-react";

/**
 * Registers the service worker (enables install + offline) and shows a one-time
 * "Add to Home Screen" hint on iOS Safari, where installation is manual (there's
 * no beforeinstallprompt). Android/desktop Chrome surface their own install UI
 * automatically once the manifest + SW are present, so no custom button needed.
 */
export function PwaRegister() {
  const [showIosHint, setShowIosHint] = useState(false);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => {});
    }
    const nav = navigator as unknown as { standalone?: boolean };
    const isIos = /ipad|iphone|ipod/i.test(navigator.userAgent);
    const standalone = window.matchMedia("(display-mode: standalone)").matches || nav.standalone === true;
    if (isIos && !standalone && localStorage.getItem("pwa-ios-hint") !== "dismissed") {
      setShowIosHint(true);
    }
  }, []);

  if (!showIosHint) return null;

  return (
    <div className="fixed inset-x-3 bottom-3 z-[80] rounded-xl border border-border bg-card p-3 text-sm shadow-xl lg:hidden">
      <div className="flex items-start gap-2">
        <p className="flex-1 text-muted-foreground">
          Install Compliance Hub: tap <Share className="inline size-3.5 align-text-bottom text-foreground" />{" "}
          <span className="font-medium text-foreground">Share</span>, then{" "}
          <span className="font-medium text-foreground">Add to Home Screen</span>.
        </p>
        <button
          aria-label="Dismiss"
          onClick={() => { localStorage.setItem("pwa-ios-hint", "dismissed"); setShowIosHint(false); }}
          className="shrink-0 text-muted-foreground hover:text-foreground"
        >
          <X className="size-4" />
        </button>
      </div>
    </div>
  );
}
