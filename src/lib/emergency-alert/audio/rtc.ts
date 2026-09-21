"use client";

/**
 * Shared pieces of the phone → admin-device audio link.
 *
 * Transport: WebRTC. Media and data are encrypted end-to-end between the two
 * devices (DTLS-SRTP). The Supabase Realtime channel `org:<org>:audio` only
 * carries the handshake (offers, answers, network candidates) — never audio.
 *
 * Protocol on the signalling channel (broadcast event "sig"):
 *   rcv → all   hello   {from, ticket, device, canSave}   (on join + every 30 s)
 *   rec → all   have    {from, incidentIds, live}         (when it has audio to give)
 *   rec → rcv   offer   {from, to, sdp, live}
 *   rcv → rec   answer  {from, to, sdp}
 *   both        ice     {from, to, candidate}
 *   either      bye     {from}
 *
 * On the data channel "clips" (rec → rcv): a JSON header {t:"clip-start", …},
 * binary chunks, then {t:"clip-end", key}. The receiver answers {t:"ack", key}
 * once the clip is on its disk; only then does the phone delete its copy.
 */

import { supabase } from "../live";

const STUN_ONLY: RTCIceServer[] = [
  { urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] },
];
let ice: Promise<RTCIceServer[]> | null = null;

/** STUN, plus the TURN relay when the server has one configured (see /api/emergency/ice). */
export function iceServers(): Promise<RTCIceServer[]> {
  ice ??= fetch("/api/emergency/ice")
    .then((r) => (r.ok ? (r.json() as Promise<{ iceServers: RTCIceServer[] }>) : { iceServers: STUN_ONLY }))
    .then((j) => j.iceServers)
    .catch(() => { ice = null; return STUN_ONLY; });
  return ice;
}

export const CHUNK = 16 * 1024;
export const CLIP_MS = 30_000;

export type Sig =
  | { type: "hello"; from: string; ticket: string; device: string; canSave: boolean }
  | { type: "have"; from: string; incidentIds: string[]; live: string | null }
  | { type: "offer"; from: string; to: string; sdp: RTCSessionDescriptionInit; live: string | null }
  | { type: "answer"; from: string; to: string; sdp: RTCSessionDescriptionInit }
  | { type: "ice"; from: string; to: string; candidate: RTCIceCandidateInit }
  | { type: "bye"; from: string };

export interface ClipHeader {
  t: "clip-start";
  key: string;
  incidentId: string;
  incidentLabel: string;
  seq: number;
  recordedAt: string;
  durationSec: number;
  mime: string;
  size: number;
  fromName: string;
}

export function peerId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Join the org's private audio signalling channel. */
export async function joinSignalling(orgId: string, onSig: (m: Sig) => void) {
  const sb = supabase();
  await sb.realtime.setAuth();
  const channel = sb.channel(`org:${orgId}:audio`, { config: { private: true, broadcast: { self: false } } });
  channel.on("broadcast", { event: "sig" }, ({ payload }) => onSig(payload as Sig));
  await new Promise<void>((resolve) => channel.subscribe((s) => { if (s === "SUBSCRIBED") resolve(); }));
  return {
    send: (m: Sig) => void channel.send({ type: "broadcast", event: "sig", payload: m }),
    close: () => void sb.removeChannel(channel),
  };
}

/** Send a blob over a data channel in chunks, respecting back-pressure. */
export async function sendBlob(dc: RTCDataChannel, header: ClipHeader, blob: Blob) {
  dc.send(JSON.stringify(header));
  const buf = await blob.arrayBuffer();
  dc.bufferedAmountLowThreshold = 1 << 20;
  for (let off = 0; off < buf.byteLength; off += CHUNK) {
    if (dc.bufferedAmount > 4 << 20) {
      await new Promise<void>((r) => { dc.onbufferedamountlow = () => { dc.onbufferedamountlow = null; r(); }; });
    }
    if (dc.readyState !== "open") throw new Error("channel closed");
    dc.send(buf.slice(off, off + CHUNK));
  }
  dc.send(JSON.stringify({ t: "clip-end", key: header.key }));
}
