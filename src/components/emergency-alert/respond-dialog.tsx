"use client";

import { useEffect, useState } from "react";
import { HandHelping, MapPin, Laptop, Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { EmergencyIncident, EmergencyResponderProfile } from "@/lib/data/schema";
import { useCreate } from "@/lib/data/hooks";
import { useAuth } from "@/lib/auth/context";
import { haversineMeters } from "@/lib/geo";
import { ASSISTANCE_TYPES, ON_FOOT_METERS, itemsFor, incidentPlace } from "@/lib/emergency-alert/rules";
import { notifyServer } from "@/lib/emergency-alert/push-client";
import { openTeams, teamsChannel } from "@/lib/emergency-alert/teams";
import { Button } from "@/components/ui/button";
import { Modal, inputCls, labelCls } from "./modal";

/** "I am responding" — prefilled from the person's defaults for this code. */
export function RespondDialog({ incident, profile, siteCoords, orgId, onClose }: {
  incident: EmergencyIncident;
  profile: EmergencyResponderProfile | null;
  siteCoords: { lat: number; lng: number } | null;
  orgId: string | null;
  onClose: () => void;
}) {
  const { user } = useAuth();
  const create = useCreate("emergencyResponses");
  const defaults = profile?.codeDefaults?.[incident.codeName] ?? {};
  const [role, setRole] = useState(profile?.emergencyRole ?? "");
  const [assist, setAssist] = useState(defaults.assistanceType ?? "");
  const [items, setItems] = useState<string[]>(defaults.itemsBringing ?? []);
  const [eta, setEta] = useState(defaults.estimatedArrival ?? "");
  const [message, setMessage] = useState("");
  const [far, setFar] = useState<number | null>(null);
  const [confirmFar, setConfirmFar] = useState(false);
  const [busy, setBusy] = useState(false);

  const target = incident.lat != null && incident.lng != null ? { lat: incident.lat, lng: incident.lng } : siteCoords;
  useEffect(() => {
    if (!target) return;
    navigator.geolocation?.getCurrentPosition(
      (p) => {
        if (p.coords.accuracy > 200) return; // too vague to judge
        const d = haversineMeters({ lat: p.coords.latitude, lng: p.coords.longitude }, target);
        if (d > ON_FOOT_METERS) setFar(Math.round(d));
      },
      () => {},
      { enableHighAccuracy: true, timeout: 6000, maximumAge: 60_000 },
    );
  }, [target?.lat, target?.lng]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async (remote: boolean) => {
    if (!user) return;
    if (!remote && far !== null && !confirmFar) { setConfirmFar(true); return; }
    setBusy(true);
    const now = new Date().toISOString();
    const msg = remote ? message || "Supporting remotely" : message;
    try {
      const r = await create.mutateAsync({
        incidentId: incident.id,
        userId: user.id,
        responderName: user.fullName,
        respondedAt: now,
        responseRole: role || null,
        assistanceType: remote ? "Remote Support" : assist || null,
        itemsBringing: remote ? [] : items,
        estimatedArrival: remote ? "Remote" : eta || null,
        status: "responding",
        statusUpdates: [{ status: "responding", message: msg, timestamp: now }],
        message: msg || null,
        isRemote: remote,
        distanceMeters: far,
      });
      notifyServer({ event: "response", id: r.id });
      openTeams(teamsChannel(orgId, "emergency"));
      onClose();
    } catch (e) {
      toast.error(`Couldn't record your response: ${e instanceof Error ? e.message : "error"}`);
    } finally {
      setBusy(false);
    }
  };

  if (confirmFar && far !== null) {
    return (
      <Modal title="You're not close by" icon={<MapPin className="size-4 text-warning" />} onClose={onClose}>
        <p className="text-sm">You&apos;re about <strong>{far >= 1609 ? `${(far / 1609).toFixed(1)} miles` : `${far} m`}</strong> from {incidentPlace(incident)} — probably more than a two-minute walk.</p>
        <div className="mt-4 grid gap-2">
          <Button onClick={() => void submit(false)} disabled={busy}>I can be there within 2 minutes</Button>
          <Button variant="secondary" onClick={() => void submit(true)} disabled={busy}><Laptop /> Support remotely instead</Button>
          <Button variant="ghost" onClick={() => setConfirmFar(false)}>Back</Button>
        </div>
      </Modal>
    );
  }

  const toggle = (it: string) => setItems((cur) => (cur.includes(it) ? cur.filter((x) => x !== it) : [...cur, it]));

  return (
    <Modal
      title={`Respond to ${incident.codeName}`}
      icon={<HandHelping className="size-4 text-primary" />}
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" onClick={() => void submit(true)} disabled={busy}><Laptop /> Support remotely</Button>
          <Button onClick={() => void submit(false)} disabled={busy} className="bg-success text-white hover:bg-success/90">
            {busy ? <Loader2 className="animate-spin" /> : <HandHelping />} I&apos;m responding
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">{incidentPlace(incident)}{incident.internalLocation ? ` · ${incident.internalLocation}` : ""}</p>
        <div>
          <p className={labelCls}>How will you help?</p>
          <div className="flex flex-wrap gap-2">
            {ASSISTANCE_TYPES.map((t) => (
              <button key={t} type="button" onClick={() => setAssist(t)}
                className={`rounded-full border px-3 py-1.5 text-sm ${assist === t ? "border-primary bg-primary/10 font-medium text-primary" : "border-border hover:bg-secondary"}`}>
                {t}
              </button>
            ))}
          </div>
        </div>
        <div>
          <p className={labelCls}>Bringing</p>
          <div className="grid grid-cols-2 gap-2">
            {itemsFor(incident.codeName).map((it) => (
              <label key={it} className="flex items-center gap-2 text-sm">
                <input type="checkbox" className="size-4" checked={items.includes(it)} onChange={() => toggle(it)} /> {it}
              </label>
            ))}
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className={labelCls} htmlFor="rs-eta">There in</label>
            <input id="rs-eta" className={inputCls} value={eta} onChange={(e) => setEta(e.target.value)} placeholder="1 min, on scene…" />
          </div>
          <div>
            <label className={labelCls} htmlFor="rs-role">Your role</label>
            <input id="rs-role" className={inputCls} value={role} onChange={(e) => setRole(e.target.value)} placeholder="General Support" />
          </div>
        </div>
        <div>
          <label className={labelCls} htmlFor="rs-msg">Message <span className="font-normal text-muted-foreground">(optional)</span></label>
          <input id="rs-msg" className={inputCls} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Anything the team should know" />
        </div>
      </div>
    </Modal>
  );
}
