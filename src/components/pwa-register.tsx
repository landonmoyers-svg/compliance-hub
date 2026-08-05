"use client";

import { useEffect, useRef, useState } from "react";
import { X, Share } from "lucide-react";
import { toast } from "sonner";

/** How often to check whether a newer build has been deployed. */
const VERSION_POLL_MS = 2 * 60 * 1000;

/**
 * Detect a new deploy from an already-open client and nudge a reload. The SW is
 * network-first (no stale bundles served on navigation), but a long-lived tab /
 * installed PWA keeps running the JS it booted with until reloaded — after a
 * security-relevant deploy a stale client can misbehave (e.g. client-side
 * storage-URL minting that the tightened bucket policy now rejects). We compare
 * the running build id against /api/version and prompt once when it changes.
 */
function useVersionWatch() {
  const baseline = useRef<string | null>(null);
  const notified = useRef(false);

  useEffect(() => {
    let cancelled = false;
    async function check() {
      if (cancelled || notified.current || document.visibilityState !== "visible") return;
      try {
        const res = await fetch("/api/version", { cache: "no-store" });
        if (!res.ok) return;
        const { version } = (await res.json()) as { version?: string };
        if (!version || version === "dev") return;
        if (baseline.current === null) { baseline.current = version; return; }
        if (version !== baseline.current) {
          notified.current = true;
          toast("A new version is available", {
            description: "Reload to get the latest — needed for document access to keep working.",
            duration: Infinity,
            action: { label: "Reload", onClick: () => window.location.reload() },
          });
        }
      } catch { /* offline / transient — ignore */ }
    }
    void check();
    const id = window.setInterval(check, VERSION_POLL_MS);
    const onVisible = () => { if (document.visibilityState === "visible") void check(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { cancelled = true; window.clearInterval(id); document.removeEventListener("visibilitychange", onVisible); };
  }, []);
}

/**
 * Registers the service worker (enables install + offline) and shows a one-time
 * "Add to Home Screen" hint on iOS Safari, where installation is manual (there's
 * no beforeinstallprompt). Android/desktop Chrome surface their own install UI
 * automatically once the manifest + SW are present, so no custom button needed.
 */
export function PwaRegister() {
  const [showIosHint, setShowIosHint] = useState(false);
  useVersionWatch();

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      // Whether an SW already controlled this page at load. If so, a later
      // controllerchange means an UPDATED SW took over → the in-page JS may be
      // stale, so reload once. On the first-ever install there was no prior
      // controller, so we must NOT reload (nothing is stale — we just loaded).
      const hadController = !!navigator.serviceWorker.controller;
      let reloaded = false;
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        if (reloaded || !hadController) return;
        reloaded = true;
        window.location.reload();
      });
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
