"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { Siren, X, MapPin, User as UserIcon, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth/context";
import { useEmergencyLive } from "@/lib/emergency-alert/live";
import { useEmergencyData } from "@/lib/emergency-alert/use-emergency";
import {
  playAlarm, playChime, unlockAudio, startTabAlert, stopTabAlert, osNotify,
} from "@/lib/emergency-alert/sounds";
import { codeKind, incidentPlace } from "@/lib/emergency-alert/rules";
import { AudioRecorderHost } from "./audio/recorder-host";
import { AudioReceiverHost } from "./audio/receiver-host";

const ACK_KEY = "emergency-acknowledged";

function readAcked(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(ACK_KEY) ?? "[]") as string[]); } catch { return new Set(); }
}
function writeAcked(s: Set<string>) {
  try { localStorage.setItem(ACK_KEY, JSON.stringify(Array.from(s).slice(-50))); } catch { /* private mode */ }
}

/**
 * App-wide emergency layer, mounted once in the shell for every signed-in user:
 *  - keeps emergency data live (realtime + safety poll)
 *  - full-screen alarm for any incident this browser hasn't acknowledged
 *  - a red strip across the top while anything is active
 *  - chimes for new responders and assistance requests
 *  - hosts incident audio: recording on the triggering device, receiving on admin devices
 */
export function EmergencyLayer() {
  const { user, profile, isAdmin } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  useEmergencyLive(!!user);
  const d = useEmergencyData();

  const [acked, setAcked] = useState<Set<string>>(readAcked);

  // Browsers block sound until the page has had a click/tap. Unlock on the first one.
  useEffect(() => {
    const unlock = () => unlockAudio();
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
    return () => { window.removeEventListener("pointerdown", unlock); window.removeEventListener("keydown", unlock); };
  }, []);

  // Incidents that should ring here: active, not mine, not yet acknowledged in this browser.
  const ringing = useMemo(
    () => d.active.filter((i) => i.triggeredBy !== user?.id && !acked.has(i.id)),
    [d.active, user?.id, acked],
  );
  const top = ringing[0];
  const topCode = d.allCodes.find((c) => c.id === top?.codeId);

  // Alarm loop + tab flash + OS notification while something is ringing.
  const notified = useRef(new Set<string>());
  useEffect(() => {
    if (!top) { stopTabAlert(); return; }
    const sound = topCode?.alarmSound ?? "default";
    playAlarm(sound);
    const loop = setInterval(() => playAlarm(sound), 3000);
    startTabAlert(top.codeName.toUpperCase());
    if (!notified.current.has(top.id)) {
      notified.current.add(top.id);
      osNotify(`${top.isTest ? "[TEST] " : "🚨 "}${top.codeName}`, `${incidentPlace(top)}${top.internalLocation ? ` · ${top.internalLocation}` : ""}`, `incident-${top.id}`);
    }
    return () => { clearInterval(loop); stopTabAlert(); };
  }, [top?.id, topCode?.alarmSound]); // eslint-disable-line react-hooks/exhaustive-deps

  // Chimes: someone responds to an active incident; someone asks for assistance.
  const seenResponses = useRef<Set<string> | null>(null);
  const seenAssist = useRef<Set<string> | null>(null);
  useEffect(() => {
    const activeIds = new Set(d.active.map((i) => i.id));
    const ids = new Set(d.responses.map((r) => r.id));
    if (seenResponses.current) {
      for (const r of d.responses) {
        if (seenResponses.current.has(r.id) || r.userId === user?.id || !activeIds.has(r.incidentId)) continue;
        const t = `${r.responseRole ?? ""} ${r.assistanceType ?? ""}`;
        playChime(t.includes("911") ? "calling911" : r.isRemote ? "responding" : "comingInPerson");
        toast.success(`${r.responderName ?? "Someone"} is responding${r.estimatedArrival ? ` · ${r.estimatedArrival}` : ""}`);
      }
    }
    seenResponses.current = ids;
  }, [d.responses, d.active, user?.id]);
  useEffect(() => {
    const ids = new Set(d.openAssistance.map((a) => a.id));
    if (seenAssist.current) {
      for (const a of d.openAssistance) {
        if (seenAssist.current.has(a.id) || a.requestedBy === user?.id) continue;
        playChime("assistanceRequest");
        toast(`${a.requestedByName} needs a hand — ${a.assistanceType}`, {
          description: `${a.locationName ?? ""}${a.urgency === "now" ? " · now" : " · within 5 min"}`,
          action: { label: "Open", onClick: () => router.push("/emergency") },
        });
      }
    }
    seenAssist.current = ids;
  }, [d.openAssistance, user?.id, router]);

  const acknowledge = () => {
    const next = new Set(acked);
    ringing.forEach((i) => next.add(i.id));
    setAcked(next);
    writeAcked(next);
    router.push("/emergency");
  };

  if (!user || !profile) return null;
  const myActive = d.active.find((i) => i.triggeredBy === user.id) ?? null;
  const myCode = d.allCodes.find((c) => c.id === myActive?.codeId);

  return (
    <>
      <AudioRecorderHost incident={myActive} enabled={!!myActive && (myCode?.audioRecordingEnabled ?? false)} />
      {(isAdmin || d.myProfile?.canListenAudio) && <AudioReceiverHost />}

      {d.active.length > 0 && !top && pathname !== "/emergency" && (
        <Link
          href="/emergency"
          className="fixed inset-x-0 top-0 z-[60] flex items-center justify-center gap-2 bg-destructive px-4 py-1.5 text-sm font-semibold text-destructive-foreground shadow-md"
        >
          <Siren className="size-4 animate-pulse" />
          {d.active[0].isTest ? "[TEST] " : ""}{d.active[0].codeName} — {incidentPlace(d.active[0])}
          {d.active.length > 1 ? ` (+${d.active.length - 1} more)` : ""}
          <span className="inline-flex items-center underline underline-offset-2">Open <ChevronRight className="size-3.5" /></span>
        </Link>
      )}

      {top && (
        <div role="alertdialog" aria-modal="true" aria-labelledby="alarm-title"
          className="emergency-flash fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="w-full max-w-lg rounded-3xl border-4 border-white/80 bg-black/85 p-8 text-center text-white shadow-2xl">
            {top.isTest && (
              <p className="mb-4 rounded-lg bg-warning px-3 py-2 text-sm font-bold text-black">TEST — no real emergency. Practise your response.</p>
            )}
            <Siren className="mx-auto mb-4 size-20 animate-bounce" />
            <h1 id="alarm-title" className="text-4xl font-black tracking-wide">EMERGENCY</h1>
            <p className="mt-1 text-3xl font-bold" style={{ color: topCode?.colorHex }}>{top.codeName}</p>
            <p className="mt-4 flex items-center justify-center gap-2 text-xl"><MapPin className="size-5" /> {incidentPlace(top)}</p>
            {top.internalLocation && <p className="mt-1 text-lg font-semibold text-warning">{top.internalLocation}</p>}
            {top.triggeredByName && <p className="mt-3 flex items-center justify-center gap-2 text-white/75"><UserIcon className="size-4" /> {top.triggeredByName}</p>}
            {ringing.length > 1 && <p className="mt-3 font-semibold text-warning">+{ringing.length - 1} more active</p>}

            <div className="mt-6 space-y-1.5 rounded-xl border border-white/20 bg-white/5 p-4 text-left text-sm">
              <p className="font-semibold text-warning">Before you go</p>
              <p>• Open the <strong>Emergency Response</strong> channel in Teams. If a meeting has started, join it with your <strong>microphone muted</strong> and volume low.</p>
              {(codeKind(top.codeName) === "armed" || codeKind(top.codeName) === "behavioral") && (
                <p className="text-warning">• Armed or combative person: turn your speakers <strong>off</strong> before joining.</p>
              )}
            </div>

            <button onClick={acknowledge} autoFocus
              className="mt-6 flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-white text-xl font-bold text-black hover:bg-white/90 focus:outline-none focus:ring-4 focus:ring-white/50">
              <X className="size-6" /> Acknowledge &amp; respond
            </button>
            <p className="mt-3 text-sm text-white/70">Keep the Hub and Teams open for the whole incident.</p>
          </div>
        </div>
      )}
    </>
  );
}
