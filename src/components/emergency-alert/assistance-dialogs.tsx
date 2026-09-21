"use client";

import { useState } from "react";
import { LifeBuoy, Zap, Clock, HandHelping, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import type { AssistanceRequest } from "@/lib/data/schema";
import { useCreate, useUpdate } from "@/lib/data/hooks";
import { useAuth } from "@/lib/auth/context";
import { ASSISTANCE_OPTIONS } from "@/lib/emergency-alert/rules";
import { notifyServer } from "@/lib/emergency-alert/push-client";
import { openTeams, teamsChannel } from "@/lib/emergency-alert/teams";
import { playChime } from "@/lib/emergency-alert/sounds";
import type { EmergencyData } from "@/lib/emergency-alert/use-emergency";
import { Button } from "@/components/ui/button";
import { Modal, inputCls, labelCls } from "./modal";
import { cn } from "@/lib/cn";

/** Non-emergency: "I need a hand here." */
export function RequestAssistanceDialog({ data, orgId, onClose }: { data: EmergencyData; orgId: string | null; onClose: () => void }) {
  const { user } = useAuth();
  const create = useCreate("assistanceRequests");
  const [type, setType] = useState("");
  const [urgency, setUrgency] = useState<AssistanceRequest["urgency"] | "">("");
  const [siteId, setSiteId] = useState(data.myLocationId && data.myLocationId !== "remote" ? data.myLocationId : "");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!user || !type || !urgency) return;
    setBusy(true);
    try {
      const a = await create.mutateAsync({
        requestedBy: user.id,
        requestedByName: user.fullName,
        locationId: siteId || null,
        locationName: data.locationName(siteId) ?? null,
        assistanceType: type,
        urgency,
        notes: notes.trim() || null,
        responders: [],
        resolved: false,
      });
      playChime("assistanceRequest");
      notifyServer({ event: "assistance", id: a.id });
      openTeams(teamsChannel(orgId, "assistance"));
      toast.success("Request sent — staff have been notified.");
      onClose();
    } catch (e) {
      toast.error(`Couldn't send: ${e instanceof Error ? e.message : "error"}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Request assistance" icon={<LifeBuoy className="size-4 text-warning" />} onClose={onClose}
      footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={submit} disabled={!type || !urgency || busy}>Send request</Button></>}>
      <p className="mb-4 text-sm text-muted-foreground">Not an emergency — this pings staff in the Hub and the Teams assistance channel.</p>
      <div className="space-y-4">
        <div>
          <p className={labelCls}>What do you need? <span className="text-destructive">*</span></p>
          <div className="grid gap-1.5 sm:grid-cols-2">
            {ASSISTANCE_OPTIONS.map((o) => (
              <button key={o} type="button" onClick={() => setType(o)}
                className={cn("rounded-md border px-3 py-2 text-left text-sm", type === o ? "border-warning bg-warning/10 font-medium" : "border-border hover:bg-secondary")}>{o}</button>
            ))}
          </div>
        </div>
        <div>
          <p className={labelCls}>How soon? <span className="text-destructive">*</span></p>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setUrgency("now")}
              className={cn("flex flex-col items-center gap-1 rounded-lg border p-3", urgency === "now" ? "border-destructive bg-destructive/10 text-destructive" : "border-border hover:bg-secondary")}>
              <Zap className="size-5" /><span className="text-sm font-semibold">Now</span>
            </button>
            <button type="button" onClick={() => setUrgency("within_5_mins")}
              className={cn("flex flex-col items-center gap-1 rounded-lg border p-3", urgency === "within_5_mins" ? "border-warning bg-warning/10 text-warning" : "border-border hover:bg-secondary")}>
              <Clock className="size-5" /><span className="text-sm font-semibold">Within 5 min</span>
            </button>
          </div>
        </div>
        <div>
          <label className={labelCls} htmlFor="as-site">Where</label>
          <select id="as-site" className={inputCls} value={siteId} onChange={(e) => setSiteId(e.target.value)}>
            <option value="">—</option>
            {data.locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls} htmlFor="as-notes">Details <span className="font-normal text-muted-foreground">(optional)</span></label>
          <input id="as-notes" className={inputCls} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Room, what's needed…" />
          <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground"><ShieldAlert className="size-3" /> No patient names or chart details.</p>
        </div>
      </div>
    </Modal>
  );
}

/** "I'm coming" on someone's assistance request. */
export function RespondAssistanceDialog({ request, onClose }: { request: AssistanceRequest; onClose: () => void }) {
  const { user } = useAuth();
  const update = useUpdate("assistanceRequests");
  const [eta, setEta] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!user) return;
    setBusy(true);
    try {
      const responders = [
        ...request.responders.filter((r) => r.userId !== user.id),
        { userId: user.id, name: user.fullName, eta: eta || "On my way", respondedAt: new Date().toISOString() },
      ];
      await update.mutateAsync({ id: request.id, patch: { responders } });
      notifyServer({ event: "assistance_response", id: request.id, who: user.fullName, eta: eta || "On my way" });
      onClose();
    } catch (e) {
      toast.error(`Couldn't save: ${e instanceof Error ? e.message : "error"}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Help with this request" icon={<HandHelping className="size-4 text-warning" />} onClose={onClose}
      footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={submit} disabled={busy}>I&apos;m coming</Button></>}>
      <p className="text-sm"><strong>{request.requestedByName}</strong> needs: <span className="text-warning">{request.assistanceType}</span>{request.locationName ? ` · ${request.locationName}` : ""}</p>
      <label className={`${labelCls} mt-4`} htmlFor="ar-eta">ETA / note <span className="font-normal text-muted-foreground">(optional)</span></label>
      <input id="ar-eta" className={inputCls} value={eta} onChange={(e) => setEta(e.target.value)} placeholder="1 min, coming now…" autoFocus />
    </Modal>
  );
}
