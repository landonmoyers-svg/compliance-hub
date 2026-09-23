"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Mic, Upload } from "lucide-react";
import type { EmergencyIncident } from "@/lib/data/schema";
import { db } from "@/lib/data";
import { useAuth } from "@/lib/auth/context";
import { useOrgId } from "@/lib/emergency-alert/live";
import { incidentPlace } from "@/lib/emergency-alert/rules";
import { clipStore, pickMime, requestPersistentStorage, type StoredClip } from "@/lib/emergency-alert/audio/clip-store";
import { CLIP_MS, iceServers, joinSignalling, peerId, sendBlob, type Sig } from "@/lib/emergency-alert/audio/rtc";

interface Peer {
  pc: RTCPeerConnection;
  dc: RTCDataChannel | null;
  canSave: boolean;
  device: string;
  sending: boolean;
}

/**
 * Runs on the device of the person who triggered an incident.
 *
 * While the incident is active (and its code has recording on) it records the
 * microphone in 30-second clips into this device's outbox, and streams the
 * live microphone to any verified admin device that's online. Each clip is
 * handed to an admin device over an encrypted peer-to-peer link and deleted
 * here once that device confirms it's saved. If no admin device is online,
 * clips wait here — even after the incident ends — until one is.
 */
export function AudioRecorderHost({ incident, enabled }: { incident: EmergencyIncident | null; enabled: boolean }) {
  const { user } = useAuth();
  const orgId = useOrgId();
  const [recording, setRecording] = useState(false);
  const [pending, setPending] = useState(0);
  const me = useRef(peerId("rec"));
  const peers = useRef(new Map<string, Peer>());
  const sig = useRef<Awaited<ReturnType<typeof joinSignalling>> | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const liveIncident = useRef<string | null>(null);

  const refreshPending = useCallback(async () => {
    try { setPending((await clipStore.all("outbox")).length); } catch { /* IndexedDB unavailable */ }
  }, []);
  useEffect(() => {
    const first = setTimeout(refreshPending, 0);
    const t = setInterval(refreshPending, 20_000);
    return () => { clearTimeout(first); clearInterval(t); };
  }, [refreshPending]);

  /* ---------------------------------------------- incident metadata (no audio) */
  const noteClip = useCallback(async (incidentId: string, seq: number, patch: { recordedAt?: string; durationSec?: number; heldBy?: string }) => {
    try {
      const cur = await db().emergencyIncidents.get(incidentId);
      if (!cur) return;
      const clips = [...cur.audioClips];
      const i = clips.findIndex((c) => c.clipIndex === seq);
      if (i >= 0) clips[i] = { ...clips[i], ...patch };
      else clips.push({ clipIndex: seq, recordedAt: patch.recordedAt ?? new Date().toISOString(), ...patch });
      await db().emergencyIncidents.update(incidentId, { audioClips: clips.sort((a, b) => a.clipIndex - b.clipIndex) });
    } catch { /* metadata is best-effort; the clip itself is safe in the outbox */ }
  }, []);

  /* ---------------------------------------------- hand clips to a peer */
  const flushTo = useCallback(async (peerKey: string) => {
    const p = peers.current.get(peerKey);
    if (!p || !p.canSave || !p.dc || p.dc.readyState !== "open" || p.sending) return;
    p.sending = true;
    try {
      const clips = (await clipStore.all("outbox")).sort((a, b) => a.recordedAt.localeCompare(b.recordedAt));
      for (const c of clips) {
        if (p.dc.readyState !== "open") break;
        await sendBlob(p.dc, {
          t: "clip-start", key: c.key, incidentId: c.incidentId, incidentLabel: c.incidentLabel, seq: c.seq,
          recordedAt: c.recordedAt, durationSec: c.durationSec, mime: c.mime, size: c.blob.size, fromName: c.fromName ?? "",
        }, c.blob);
      }
    } catch { /* connection dropped — clips stay in the outbox */ }
    finally { p.sending = false; }
  }, []);

  const flushAll = useCallback(() => { for (const k of peers.current.keys()) void flushTo(k); }, [flushTo]);

  /* ---------------------------------------------- peer connections */
  const dropPeer = useCallback((k: string) => {
    const p = peers.current.get(k);
    if (!p) return;
    try { p.pc.close(); } catch { /* already closed */ }
    peers.current.delete(k);
  }, []);

  const connect = useCallback(async (hello: Extract<Sig, { type: "hello" }>) => {
    if (peers.current.has(hello.from)) return;
    // Only verified admin / "can listen" devices get anything.
    const res = await fetch("/api/emergency/audio-ticket", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ticket: hello.ticket }) })
      .then((r) => r.json() as Promise<{ ok: boolean; canSave?: boolean }>).catch(() => ({ ok: false } as { ok: boolean; canSave?: boolean }));
    const servers = await iceServers();
    if (!res.ok || peers.current.has(hello.from)) return;

    const pc = new RTCPeerConnection({ iceServers: servers });
    const peer: Peer = { pc, dc: null, canSave: !!res.canSave, device: hello.device, sending: false };
    peers.current.set(hello.from, peer);

    stream.current?.getAudioTracks().forEach((t) => pc.addTrack(t, stream.current!));
    if (peer.canSave) {
      const dc = pc.createDataChannel("clips", { ordered: true });
      dc.binaryType = "arraybuffer";
      dc.onopen = () => void flushTo(hello.from);
      dc.onmessage = async (e) => {
        const m = JSON.parse(String(e.data)) as { t: string; key: string };
        if (m.t !== "ack") return;
        const clip = await clipStore.get("outbox", m.key);
        if (clip) {
          await clipStore.remove("outbox", m.key);
          void noteClip(clip.incidentId, clip.seq, { heldBy: hello.device });
          void refreshPending();
        }
      };
      peer.dc = dc;
    }
    pc.onicecandidate = (e) => { if (e.candidate) sig.current?.send({ type: "ice", from: me.current, to: hello.from, candidate: e.candidate.toJSON() }); };
    pc.onconnectionstatechange = () => { if (["failed", "closed"].includes(pc.connectionState)) dropPeer(hello.from); };
    await pc.setLocalDescription(await pc.createOffer({ offerToReceiveAudio: false }));
    sig.current?.send({ type: "offer", from: me.current, to: hello.from, sdp: pc.localDescription!.toJSON(), live: liveIncident.current });
  }, [dropPeer, flushTo, noteClip, refreshPending]);

  const onSig = useCallback((m: Sig) => {
    if (m.type === "hello") void connect(m);
    else if (m.type === "answer" && m.to === me.current) void peers.current.get(m.from)?.pc.setRemoteDescription(m.sdp);
    else if (m.type === "ice" && m.to === me.current) void peers.current.get(m.from)?.pc.addIceCandidate(m.candidate).catch(() => {});
    else if (m.type === "bye") dropPeer(m.from);
  }, [connect, dropPeer]);

  // Signalling runs while recording or while clips are waiting to go.
  const needLink = !!orgId && !!user && (enabled || pending > 0);
  useEffect(() => {
    if (!needLink || !orgId) return;
    let alive = true;
    let timer: ReturnType<typeof setInterval> | null = null;
    const currentPeers = peers.current;
    const myId = me.current;
    void (async () => {
      const s = await joinSignalling(orgId, onSig);
      if (!alive) { s.close(); return; }
      sig.current = s;
      const announce = async () => {
        const outbox = await clipStore.all("outbox").catch(() => [] as StoredClip[]);
        s.send({ type: "have", from: me.current, incidentIds: Array.from(new Set(outbox.map((c) => c.incidentId))), live: liveIncident.current });
      };
      void announce();
      timer = setInterval(announce, 15_000);
    })();
    return () => {
      alive = false;
      if (timer) clearInterval(timer);
      sig.current?.send({ type: "bye", from: myId });
      sig.current?.close();
      sig.current = null;
      for (const k of Array.from(currentPeers.keys())) dropPeer(k);
    };
  }, [needLink, orgId, onSig, dropPeer]);

  /* ---------------------------------------------- the microphone */
  useEffect(() => {
    if (!enabled || !incident || !user) return;
    let stopped = false;
    let recorder: MediaRecorder | null = null;
    let cutTimer: ReturnType<typeof setTimeout> | null = null;
    const label = `${incident.codeName} — ${incidentPlace(incident)}`;
    const mime = pickMime();

    void (async () => {
      void requestPersistentStorage();
      let s: MediaStream;
      try { s = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false } }); }
      catch { return; } // mic denied — the rest of the alert still works
      if (stopped) { s.getTracks().forEach((t) => t.stop()); return; }
      stream.current = s;
      liveIncident.current = incident.id;
      setRecording(true);
      // Existing links were made without the mic; add it and renegotiate so admins hear it live.
      for (const [k, p] of peers.current) {
        s.getAudioTracks().forEach((t) => p.pc.addTrack(t, s));
        void p.pc.createOffer().then(async (offer) => {
          await p.pc.setLocalDescription(offer);
          sig.current?.send({ type: "offer", from: me.current, to: k, sdp: p.pc.localDescription!.toJSON(), live: incident.id });
        }).catch(() => dropPeer(k));
      }

      const existing = (await clipStore.byIncident("outbox", incident.id).catch(() => [] as StoredClip[])).length;
      let seq = Math.max(existing, incident.audioClips.length);

      const recordOne = () => {
        if (stopped) return;
        const chunks: Blob[] = [];
        const startedAt = new Date();
        recorder = new MediaRecorder(s, mime ? { mimeType: mime } : undefined);
        recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
        recorder.onstop = async () => {
          const n = seq++;
          const blob = new Blob(chunks, { type: recorder?.mimeType || mime || "audio/webm" });
          const durationSec = Math.round((Date.now() - startedAt.getTime()) / 1000);
          if (blob.size > 0) {
            await clipStore.put("outbox", {
              key: `${incident.id}:${n}`, incidentId: incident.id, incidentLabel: label, seq: n,
              recordedAt: startedAt.toISOString(), durationSec, mime: blob.type, blob, fromName: user.fullName,
            }).catch(() => {});
            void noteClip(incident.id, n, { recordedAt: startedAt.toISOString(), durationSec });
            void refreshPending();
            flushAll();
          }
          if (!stopped) recordOne();
        };
        recorder.start();
        cutTimer = setTimeout(() => { if (recorder?.state === "recording") recorder.stop(); }, CLIP_MS);
      };
      recordOne();
    })();

    return () => {
      stopped = true;
      if (cutTimer) clearTimeout(cutTimer);
      if (recorder?.state === "recording") recorder.stop(); // saves the final partial clip
      stream.current?.getTracks().forEach((t) => t.stop());
      stream.current = null;
      liveIncident.current = null;
      setRecording(false);
    };
  }, [enabled, incident?.id, user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!recording && pending === 0) return null;
  return (
    <div className="fixed bottom-4 left-4 z-[70] flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-xs shadow-lg">
      {recording ? (
        <><span className="relative flex size-2.5"><span className="absolute inline-flex size-full animate-ping rounded-full bg-destructive opacity-75" /><span className="relative inline-flex size-2.5 rounded-full bg-destructive" /></span>
          <Mic className="size-3.5" /> Recording incident audio — kept only on admin devices</>
      ) : (
        <><Upload className="size-3.5 text-warning" /> {pending} audio clip{pending === 1 ? "" : "s"} waiting for an admin device — keep the Hub open</>
      )}
    </div>
  );
}
