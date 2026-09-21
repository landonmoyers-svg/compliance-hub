"use client";

import { useEffect, useRef } from "react";
import { db } from "@/lib/data";
import { useAuth } from "@/lib/auth/context";
import { useOrgId } from "@/lib/emergency-alert/live";
import { clipStore, deviceLabel, requestPersistentStorage } from "@/lib/emergency-alert/audio/clip-store";
import { ICE_SERVERS, joinSignalling, peerId, type ClipHeader, type Sig } from "@/lib/emergency-alert/audio/rtc";
import { liveStore } from "@/lib/emergency-alert/audio/live-store";

/**
 * Runs on admin devices (and people an admin marked "can listen"). Announces
 * itself on the org's audio channel with a server-issued ticket, accepts
 * connections from a recording phone, plays nothing by itself (the dashboard
 * has a Listen button), and saves every clip it's handed into this device's
 * own storage — then tells the phone it's safe to delete its copy.
 */
export function AudioReceiverHost() {
  const { user } = useAuth();
  const orgId = useOrgId();
  const me = useRef(peerId("rcv"));

  useEffect(() => {
    if (!orgId || !user) return;
    let alive = true;
    const myId = me.current;
    let hello: ReturnType<typeof setInterval> | null = null;
    const pcs = new Map<string, RTCPeerConnection>();
    const liveFor = new Map<string, string | null>(); // recorder → incident it's streaming
    let sig: Awaited<ReturnType<typeof joinSignalling>> | null = null;

    void (async () => {
      const t = await fetch("/api/emergency/audio-ticket").then(async (r) => (r.ok ? (r.json() as Promise<{ ticket: string; canSave: boolean }>) : null)).catch(() => null);
      if (!alive) return;
      if (!t) { liveStore.setStatus("denied"); return; }
      if (t.canSave) void requestPersistentStorage();
      const device = deviceLabel();
      const sayHello = () => sig?.send({ type: "hello", from: me.current, ticket: t.ticket, device, canSave: t.canSave });

      const onOffer = async (m: Extract<Sig, { type: "offer" }>) => {
        liveFor.set(m.from, m.live);
        // Same phone renegotiating (e.g. it just started recording and added its
        // microphone) — answer on the existing connection.
        const existing = pcs.get(m.from);
        if (existing && existing.connectionState !== "closed" && existing.connectionState !== "failed") {
          await existing.setRemoteDescription(m.sdp);
          await existing.setLocalDescription(await existing.createAnswer());
          sig?.send({ type: "answer", from: me.current, to: m.from, sdp: existing.localDescription!.toJSON() });
          return;
        }
        existing?.close();
        const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
        pcs.set(m.from, pc);
        pc.onicecandidate = (e) => { if (e.candidate) sig?.send({ type: "ice", from: me.current, to: m.from, candidate: e.candidate.toJSON() }); };
        pc.ontrack = (e) => {
          const stream = e.streams[0] ?? new MediaStream([e.track]);
          const live = liveFor.get(m.from);
          if (live) liveStore.addFeed({ incidentId: live, stream, from: m.from });
          e.track.onended = () => liveStore.removeFrom(m.from);
        };
        pc.onconnectionstatechange = () => {
          if (["failed", "closed", "disconnected"].includes(pc.connectionState)) liveStore.removeFrom(m.from);
        };
        pc.ondatachannel = (e) => {
          const dc = e.channel;
          dc.binaryType = "arraybuffer";
          let header: ClipHeader | null = null;
          let parts: ArrayBuffer[] = [];
          dc.onmessage = async (ev) => {
            if (typeof ev.data !== "string") { parts.push(ev.data as ArrayBuffer); return; }
            const msg = JSON.parse(ev.data) as ClipHeader | { t: "clip-end"; key: string };
            if (msg.t === "clip-start") { header = msg; parts = []; return; }
            if (msg.t === "clip-end" && header && header.key === msg.key) {
              const h = header;
              const blob = new Blob(parts, { type: h.mime });
              header = null; parts = [];
              if (blob.size !== h.size) return; // incomplete — the phone will resend
              try {
                await clipStore.put("library", {
                  key: h.key, incidentId: h.incidentId, incidentLabel: h.incidentLabel, seq: h.seq,
                  recordedAt: h.recordedAt, durationSec: h.durationSec, mime: h.mime, blob,
                  receivedAt: new Date().toISOString(), fromName: h.fromName,
                });
              } catch { return; } // not saved → no ack → phone keeps it
              dc.send(JSON.stringify({ t: "ack", key: h.key }));
              liveStore.clipSaved();
              void db().emergencyAudioLog.create({
                incidentId: h.incidentId, incidentLabel: h.incidentLabel, action: "saved_clip",
                performedBy: user.id, performedByName: user.fullName, performedByEmail: user.email,
                clipIndex: h.seq, deviceLabel: device, details: `${h.durationSec}s clip saved on this device`,
              }).catch(() => {});
            }
          };
        };
        await pc.setRemoteDescription(m.sdp);
        await pc.setLocalDescription(await pc.createAnswer());
        sig?.send({ type: "answer", from: me.current, to: m.from, sdp: pc.localDescription!.toJSON() });
      };

      sig = await joinSignalling(orgId, (m) => {
        if (m.type === "have" && !pcs.has(m.from)) sayHello();
        else if (m.type === "offer" && m.to === me.current) void onOffer(m);
        else if (m.type === "ice" && m.to === me.current) void pcs.get(m.from)?.addIceCandidate(m.candidate).catch(() => {});
        else if (m.type === "bye") { pcs.get(m.from)?.close(); pcs.delete(m.from); liveStore.removeFrom(m.from); }
      });
      if (!alive) { sig.close(); return; }
      liveStore.setStatus("ready");
      sayHello();
      hello = setInterval(sayHello, 30_000);
    })();

    return () => {
      alive = false;
      if (hello) clearInterval(hello);
      sig?.send({ type: "bye", from: myId });
      sig?.close();
      pcs.forEach((pc) => pc.close());
      liveStore.setStatus("off");
    };
  }, [orgId, user]);

  return null;
}
