"use client";

import { useEffect, useRef, useState } from "react";
import { Siren, MapPin, Mic, ShieldAlert, Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { EmergencyCode } from "@/lib/data/schema";
import { useCreate } from "@/lib/data/hooks";
import { useAuth } from "@/lib/auth/context";
import { haversineMeters } from "@/lib/geo";
import { REMOTE_TRIGGER_METERS } from "@/lib/emergency-alert/rules";
import { notifyServer } from "@/lib/emergency-alert/push-client";
import { openTeams, teamsChannel } from "@/lib/emergency-alert/teams";
import { unlockAudio } from "@/lib/emergency-alert/sounds";
import type { EmergencyData } from "@/lib/emergency-alert/use-emergency";
import { Button } from "@/components/ui/button";
import { Modal, inputCls, labelCls } from "./modal";

interface Fix { lat: number; lng: number; accuracy: number }

/** Raise an emergency. Few fields, big target, prefilled with where you are today. */
export function TriggerDialog({ code, data, orgId, onClose }: {
  code: EmergencyCode;
  data: EmergencyData;
  orgId: string | null;
  onClose: () => void;
}) {
  const { user } = useAuth();
  const create = useCreate("emergencyIncidents");
  const [siteId, setSiteId] = useState<string>(data.myLocationId ?? "");
  const [room, setRoom] = useState("");
  const [notes, setNotes] = useState("");
  const [isTest, setIsTest] = useState(false);
  const [fix, setFix] = useState<Fix | null>(null);
  const [place, setPlace] = useState<{ city?: string; state?: string } | null>(null);
  const busy = useRef(false);
  const [submitting, setSubmitting] = useState(false);

  // Where the phone is, to tell an on-site alert from one raised remotely.
  useEffect(() => {
    unlockAudio();
    navigator.geolocation?.getCurrentPosition(
      (p) => setFix({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }),
      () => {},
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60_000 },
    );
  }, []);

  const site = data.locations.find((l) => l.id === siteId);
  const distance = fix && site?.lat != null && site?.lng != null ? haversineMeters(fix, { lat: site.lat, lng: site.lng }) : null;
  const isRemote = siteId === "remote" || (distance !== null && distance > REMOTE_TRIGGER_METERS && fix!.accuracy < 200);

  // City/state for a remote trigger (street address deliberately not kept).
  useEffect(() => {
    if (!isRemote || !fix || place) return;
    fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=10&lat=${fix.lat}&lon=${fix.lng}`)
      .then((r) => r.json())
      .then((j: { address?: Record<string, string> }) => setPlace({ city: j.address?.city ?? j.address?.town ?? j.address?.village ?? j.address?.county, state: j.address?.state }))
      .catch(() => {});
  }, [isRemote, fix, place]);

  const submit = async () => {
    if (!user || !siteId || busy.current) return;
    busy.current = true;
    setSubmitting(true);
    try {
      const incident = await create.mutateAsync({
        codeId: code.id,
        codeName: code.name,
        locationId: siteId === "remote" ? null : siteId,
        locationName: siteId === "remote" ? null : site?.name ?? null,
        internalLocation: room.trim() || null,
        notes: notes.trim() || null,
        triggeredBy: user.id,
        triggeredByName: user.fullName,
        triggeredAt: new Date().toISOString(),
        lat: isRemote ? null : fix?.lat ?? site?.lat ?? null,
        lng: isRemote ? null : fix?.lng ?? site?.lng ?? null,
        isRemote,
        remoteCity: isRemote ? place?.city ?? null : null,
        remoteState: isRemote ? place?.state ?? null : null,
        isTest,
        evacuationStatus: "pending",
        resolved: false,
        audioClips: [],
      });
      notifyServer({ event: "incident", id: incident.id });
      toast.success(`${isTest ? "[TEST] " : ""}${code.name} sent — everyone signed in is being alerted.`);
      if (typeof Notification !== "undefined" && Notification.permission === "default") void Notification.requestPermission();
      openTeams(teamsChannel(orgId, "emergency"));
      onClose();
    } catch (e) {
      toast.error(`Couldn't send the alert: ${e instanceof Error ? e.message : "unknown error"}. Call 911 directly if needed.`);
    } finally {
      busy.current = false;
      setSubmitting(false);
    }
  };

  return (
    <Modal
      title={<>{isTest ? "Test " : ""}{code.name}</>}
      icon={<Siren className="size-5" style={{ color: code.colorHex }} />}
      accent={code.colorHex}
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={submitting}>Cancel</Button>
          <Button onClick={submit} disabled={!siteId || submitting} className="h-11 px-6 text-base text-white" style={{ backgroundColor: code.colorHex }}>
            {submitting ? <Loader2 className="animate-spin" /> : <Siren />}
            {submitting ? "Sending…" : `${isTest ? "Send test" : "Trigger"} ${code.name}`}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {code.description && <p className="text-sm text-muted-foreground">{code.description}</p>}

        <div>
          <label className={labelCls} htmlFor="em-site">Where <span className="text-destructive">*</span></label>
          <select id="em-site" className={inputCls} value={siteId} onChange={(e) => setSiteId(e.target.value)}>
            <option value="" disabled>Choose a site…</option>
            {data.locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            <option value="remote">I&apos;m not at a site (remote)</option>
          </select>
          {distance !== null && siteId !== "remote" && (
            <p className={`mt-1 flex items-center gap-1 text-xs ${isRemote ? "text-warning" : "text-muted-foreground"}`}>
              <MapPin className="size-3" />
              {isRemote ? `You seem to be ${(distance / 1609).toFixed(1)} mi from ${site?.name} — this will be marked as raised remotely.` : `You're at ${site?.name}.`}
            </p>
          )}
        </div>

        <div>
          <label className={labelCls} htmlFor="em-room">Exact spot</label>
          <input id="em-room" className={inputCls} value={room} onChange={(e) => setRoom(e.target.value)} placeholder="Room 3, front lobby, hallway B…" autoFocus />
        </div>

        <div>
          <label className={labelCls} htmlFor="em-notes">What&apos;s happening <span className="font-normal text-muted-foreground">(optional)</span></label>
          <textarea id="em-notes" className={`${inputCls} min-h-20`} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Describe the situation" />
          <p className="mt-1 flex items-start gap-1 text-xs text-muted-foreground">
            <ShieldAlert className="mt-0.5 size-3 shrink-0" /> Describe the situation, not the patient — no names or chart details. This goes to every staff member and Teams.
          </p>
        </div>

        {code.audioRecordingEnabled && (
          <div className="flex gap-2 rounded-md border border-warning/40 bg-warning/10 p-3 text-xs">
            <Mic className="mt-0.5 size-4 shrink-0 text-warning" />
            <p><strong>Audio recording.</strong> Once triggered, this device records audio for the rest of the incident. Recordings go straight to admin devices and are kept only there — never on the Hub&apos;s servers. Allow the microphone when asked, and keep this page open.</p>
          </div>
        )}

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={isTest} onChange={(e) => setIsTest(e.target.checked)} className="size-4" />
          This is a drill / test — every notification will say <strong>TEST</strong>
        </label>
      </div>
    </Modal>
  );
}
