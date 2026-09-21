"use client";

/**
 * Alarm tones, synthesized with Web Audio (no audio files to load or cache —
 * an alarm must sound even on a cold, offline-ish page). Patterns are LP Alert's.
 *
 * Browsers only let a page make sound after the user has interacted with it,
 * so `unlockAudio()` is called on the first click/tap anywhere in the app;
 * after that an incoming alert can sound on its own.
 */

import type { AlarmSound } from "@/lib/data/schema";

let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

/** Call from any user gesture so later alarms are allowed to play. */
export function unlockAudio() {
  const c = audio();
  if (!c) return;
  // A silent blip is enough to satisfy the autoplay policy.
  const g = c.createGain();
  g.gain.value = 0;
  g.connect(c.destination);
  const o = c.createOscillator();
  o.connect(g);
  o.start();
  o.stop(c.currentTime + 0.01);
}

export function audioUnlocked(): boolean {
  return ctx?.state === "running";
}

function beep(c: AudioContext, freq: number, start: number, dur: number, type: OscillatorType = "square", vol = 0.3) {
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.connect(gain);
  gain.connect(c.destination);
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(vol, start);
  gain.gain.exponentialRampToValueAtTime(0.001, start + dur);
  osc.start(start);
  osc.stop(start + dur);
}

/** One cycle of a code's alarm pattern (≈1–2 s). Repeat it every 3 s for a live alert. */
export function playAlarm(sound: AlarmSound | string = "default") {
  const c = audio();
  if (!c || sound === "silent") return;
  const t = c.currentTime;
  switch (sound) {
    case "fire_alarm": {
      // NFPA 72 temporal-three pattern
      const pulse = (s: number) => { beep(c, 1260, s, 0.13, "sawtooth"); beep(c, 1260, s + 0.17, 0.13, "sawtooth"); beep(c, 1260, s + 0.34, 0.13, "sawtooth"); };
      pulse(t); pulse(t + 0.65); pulse(t + 1.3);
      break;
    }
    case "beep_fast":
      [0, 0.15, 0.3, 0.45, 0.6].forEach((o) => beep(c, 1000, t + o, 0.1));
      break;
    case "beep_slow":
      [0, 0.5, 1.0].forEach((o) => beep(c, 800, t + o, 0.3));
      break;
    case "siren_high":
      beep(c, 600, t, 0.3, "sawtooth"); beep(c, 900, t + 0.35, 0.3, "sawtooth"); beep(c, 1200, t + 0.7, 0.3, "sawtooth");
      break;
    case "siren_low":
      beep(c, 400, t, 0.3, "sawtooth"); beep(c, 550, t + 0.35, 0.3, "sawtooth"); beep(c, 700, t + 0.7, 0.3, "sawtooth");
      break;
    case "triple_beep":
      beep(c, 900, t, 0.12); beep(c, 900, t + 0.16, 0.12); beep(c, 900, t + 0.32, 0.12);
      break;
    default:
      beep(c, 880, t, 0.15); beep(c, 880, t + 0.2, 0.15); beep(c, 1100, t + 0.4, 0.3);
  }
}

export type Chime = "responding" | "calling911" | "comingInPerson" | "cancelled" | "assistanceRequest";

/** Short, softer cues for things that happen during an incident. */
export function playChime(kind: Chime) {
  const c = audio();
  if (!c) return;
  const t = c.currentTime;
  const tone = (f: number, at: number, d: number, v = 0.3) => beep(c, f, t + at, d, "sine", v);
  switch (kind) {
    case "responding": tone(523, 0, 0.15); tone(659, 0.15, 0.15); break;
    case "calling911": tone(523, 0, 0.12); tone(659, 0.12, 0.12); tone(784, 0.24, 0.12); break;
    case "comingInPerson": tone(784, 0, 0.12); tone(659, 0.12, 0.12); tone(784, 0.24, 0.12); break;
    case "cancelled": tone(659, 0, 0.15); tone(523, 0.15, 0.15); break;
    case "assistanceRequest": tone(523, 0, 0.25, 0.15); tone(659, 0.22, 0.25, 0.15); tone(784, 0.44, 0.35, 0.12); break;
  }
}

/* ------------------------------------------------------------- tab + OS notice */

const ALERT_FAVICON =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Ccircle cx='16' cy='16' r='16' fill='%23E53935'/%3E%3Ctext x='16' y='22' text-anchor='middle' font-size='18' fill='white' font-family='sans-serif' font-weight='bold'%3E!%3C/text%3E%3C/svg%3E";

let flash: ReturnType<typeof setInterval> | null = null;
let savedTitle = "";
let savedIcon: string | null = null;

function faviconEl(): HTMLLinkElement {
  let link = document.querySelector<HTMLLinkElement>("link[rel~='icon']");
  if (!link) {
    link = document.createElement("link");
    link.rel = "icon";
    document.head.appendChild(link);
  }
  return link;
}

/** Flash the tab title + favicon so a backgrounded tab is noticed. */
export function startTabAlert(title: string) {
  if (flash || typeof document === "undefined") return;
  savedTitle = document.title;
  const icon = faviconEl();
  savedIcon = icon.href;
  let on = false;
  flash = setInterval(() => {
    on = !on;
    document.title = on ? `🚨 ${title}` : savedTitle;
    icon.href = on ? ALERT_FAVICON : (savedIcon ?? icon.href);
  }, 800);
}

export function stopTabAlert() {
  if (!flash) return;
  clearInterval(flash);
  flash = null;
  document.title = savedTitle;
  if (savedIcon) faviconEl().href = savedIcon;
}

/** A persistent OS-level notification (needs permission). Clicking it focuses the tab. */
export function osNotify(title: string, body: string, tag: string) {
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
  try {
    const n = new Notification(title, { body, tag, requireInteraction: true, icon: "/icon-192.png" });
    n.onclick = () => { window.focus(); n.close(); };
  } catch {
    // Some mobile browsers only allow notifications from a service worker.
  }
}
