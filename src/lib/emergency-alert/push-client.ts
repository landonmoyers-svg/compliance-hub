"use client";

import { supabase } from "./live";
import { inNativeApp } from "./sounds";

/** Browser push is available here and the server has a VAPID key configured. */
export function pushSupported(): boolean {
  return typeof window !== "undefined"
    && "serviceWorker" in navigator
    && "PushManager" in window
    && !!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
}

function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const pad = "=".repeat((4 - (base64url.length % 4)) % 4);
  const raw = atob((base64url + pad).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/**
 * Ask for notification permission (must be called from a click) and register
 * this device for emergency push. Safe to call repeatedly.
 */
export async function enableAlertsOnThisDevice(): Promise<"granted" | "denied" | "unsupported"> {
  if (inNativeApp()) return "granted"; // the Mac app raises macOS notifications itself
  if (typeof Notification === "undefined") return "unsupported";
  const perm = Notification.permission === "default" ? await Notification.requestPermission() : Notification.permission;
  if (perm !== "granted") return "denied";
  if (!pushSupported()) return "granted"; // in-app + tab alerts still work

  const reg = await navigator.serviceWorker.ready;
  const sub = (await reg.pushManager.getSubscription())
    ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!) }));
  const json = sub.toJSON() as { endpoint: string; keys?: { p256dh?: string; auth?: string } };
  if (json.keys?.p256dh && json.keys.auth) {
    await supabase().from("push_subscriptions").upsert(
      { endpoint: json.endpoint, p256dh: json.keys.p256dh, auth: json.keys.auth, user_agent: navigator.userAgent.slice(0, 200), last_used_at: new Date().toISOString() },
      { onConflict: "endpoint" },
    );
  }
  return "granted";
}

/** Fire-and-forget: tell the server to fan an event out to Teams / push. */
export function notifyServer(body: Record<string, unknown>) {
  void fetch("/api/emergency/notify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    keepalive: true, // survives navigating away right after triggering
  }).catch(() => {});
}
