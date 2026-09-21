"use client";

import { useState } from "react";
import {
  CheckCircle2, MapPin, User as UserIcon, Clock, HandHelping, Phone, Heart, Shield, Users, LogOut, Home,
  ChevronDown, Mic, Wifi, Info,
} from "lucide-react";
import { toast } from "sonner";
import type { EmergencyIncident, EmergencyResponse, ResponseStatus } from "@/lib/data/schema";
import { useUpdate } from "@/lib/data/hooks";
import { useAuth } from "@/lib/auth/context";
import {
  CORE_ROLES, claimedCoreRoles, codeKind, codeRoleStatus, formatWhen, incidentPlace, isUrgentRole,
  needsEvacuationControl, refugeFor, siteContext, type CoreRoleKey,
} from "@/lib/emergency-alert/rules";
import { notifyServer } from "@/lib/emergency-alert/push-client";
import type { EmergencyData } from "@/lib/emergency-alert/use-emergency";
import type { OnlinePerson } from "@/lib/emergency-alert/live";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { IncidentGuidance } from "./guidance";
import { LiveListen } from "./audio/live-listen";

const ROLE_ICON: Record<CoreRoleKey, typeof Phone> = { calling911: Phone, medical: Heart, safety: Shield, inPerson: Users };
const STATUS_LABEL: Record<ResponseStatus, string> = { responding: "On the way", on_site: "On scene", standby: "Standing by", completed: "Done" };
const STATUS_VARIANT: Record<ResponseStatus, "warning" | "default" | "secondary" | "success"> = { responding: "warning", on_site: "default", standby: "secondary", completed: "success" };

export function IncidentCard({ incident, data, online, onRespond }: {
  incident: EmergencyIncident;
  data: EmergencyData;
  online: OnlinePerson[];
  onRespond: () => void;
}) {
  const { user, isAdmin } = useAuth();
  const updateIncident = useUpdate("emergencyIncidents");
  const code = data.allCodes.find((c) => c.id === incident.codeId);
  const kind = codeKind(incident.codeName);
  const responses = data.responsesFor(incident.id);
  const mine = responses.find((r) => r.userId === user?.id);
  const claimed = claimedCoreRoles(responses);
  const codeRoles = codeRoleStatus(code, responses);
  const messages = siteContext(incident, data.settings, data.locations);
  const canResolve = isAdmin || incident.triggeredBy === user?.id;
  const [guideOpen, setGuideOpen] = useState(true);
  const color = code?.colorHex ?? "hsl(var(--destructive))";

  const resolve = async () => {
    if (!user) return;
    if (!window.confirm(`Mark ${incident.codeName} at ${incidentPlace(incident)} as resolved? Everyone's alarm stops.`)) return;
    try {
      await updateIncident.mutateAsync({ id: incident.id, patch: { resolved: true, resolvedAt: new Date().toISOString(), resolvedByName: user.fullName } });
      notifyServer({ event: "resolved", id: incident.id });
      toast.success("Resolved. All clear sent.");
    } catch (e) {
      toast.error(`Couldn't resolve: ${e instanceof Error ? e.message : "error"}`);
    }
  };

  const setEvac = async (evacuationStatus: EmergencyIncident["evacuationStatus"]) => {
    try {
      await updateIncident.mutateAsync({ id: incident.id, patch: { evacuationStatus } });
      notifyServer({ event: "evacuation", id: incident.id });
    } catch (e) {
      toast.error(`Couldn't set the directive: ${e instanceof Error ? e.message : "error"}`);
    }
  };

  const available = online.filter((p) => !responses.some((r) => r.userId === p.userId));
  const refuge = refugeFor(data.myLocationId, incident.locationId, data.settings, data.locations);

  return (
    <Card className="overflow-hidden" style={{ borderTop: `6px solid ${color}` }}>
      <CardContent className="space-y-4 p-5">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-2xl font-bold" style={{ color }}>{incident.codeName}</h2>
              {incident.isTest && <Badge variant="warning">TEST</Badge>}
              {code?.priority && <Badge variant="destructive">{code.priority}</Badge>}
            </div>
            <p className="flex items-center gap-1.5 font-medium"><MapPin className="size-4 text-muted-foreground" /> {incidentPlace(incident)}</p>
            {incident.internalLocation && <p className="pl-5 text-lg font-semibold text-warning">{incident.internalLocation}</p>}
            {incident.isRemote && <p className="flex items-center gap-1 pl-5 text-xs text-warning"><Wifi className="size-3" /> Raised remotely</p>}
            <p className="flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
              <UserIcon className="size-3.5" /> {incident.triggeredByName ?? "Unknown"} <span>·</span> <Clock className="size-3.5" /> {formatWhen(incident.triggeredAt)}
            </p>
            {incident.lat != null && incident.lng != null && (
              <a className="pl-5 text-xs text-primary underline-offset-2 hover:underline" target="_blank" rel="noreferrer"
                href={`https://maps.google.com/?q=${incident.lat},${incident.lng}`}>Open in Maps</a>
            )}
          </div>
          {canResolve && (
            <Button onClick={resolve} className="bg-success text-white hover:bg-success/90"><CheckCircle2 /> Resolve</Button>
          )}
        </div>

        {incident.notes && <p className="rounded-md bg-secondary px-3 py-2 text-sm">{incident.notes}</p>}

        {/* Respond — the one thing most people need to do */}
        {!mine ? (
          <Button onClick={onRespond} className="h-12 w-full text-base" style={{ backgroundColor: color, color: "white" }}>
            <HandHelping /> I&apos;m responding
          </Button>
        ) : (
          <MyStatus response={mine} />
        )}

        {/* Evacuation directive */}
        {needsEvacuationControl(kind) && (
          <div className="rounded-lg border border-border p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Directive</p>
            <p className={cn("mt-1 flex items-center gap-2 font-semibold",
              incident.evacuationStatus === "evacuate" ? "text-destructive" : incident.evacuationStatus === "shelter" ? "text-primary" : "text-warning")}>
              {incident.evacuationStatus === "evacuate" ? <><LogOut className="size-4" /> EVACUATE — go to the assembly point now</>
                : incident.evacuationStatus === "shelter" ? <><Home className="size-4" /> SHELTER IN PLACE — lock down and secure</>
                : <>Waiting for a coordinator&apos;s directive…</>}
            </p>
            {incident.evacuationStatus === "evacuate" && refuge.length > 0 && (
              <p className="mt-2 flex items-start gap-1.5 rounded-md bg-success/10 px-2 py-1.5 text-xs"><Info className="mt-0.5 size-3.5 shrink-0" /> From your site, {refuge.join(" or ")} can serve as a refuge if it&apos;s confirmed clear.</p>
            )}
            {isAdmin && (
              <div className="mt-3 flex gap-2">
                <Button size="sm" variant={incident.evacuationStatus === "evacuate" ? "destructive" : "outline"} onClick={() => void setEvac("evacuate")}><LogOut /> Evacuate</Button>
                {kind === "armed" && (
                  <Button size="sm" variant={incident.evacuationStatus === "shelter" ? "default" : "outline"} onClick={() => void setEvac("shelter")}><Home /> Shelter in place</Button>
                )}
              </div>
            )}
          </div>
        )}

        {/* Roles */}
        <div className="grid gap-3 lg:grid-cols-2">
          <div className="space-y-1.5">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Needed now</p>
            {CORE_ROLES.map((r) => {
              const Icon = ROLE_ICON[r.key];
              const ok = claimed.has(r.key);
              const urgent = !ok && isUrgentRole(r.key, kind);
              return (
                <div key={r.key} className={cn("flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm",
                  ok ? "border-success/40 bg-success/10" : urgent ? "animate-pulse border-destructive/60 bg-destructive/10" : "border-border")}>
                  <Icon className={cn("size-4", ok ? "text-success" : urgent ? "text-destructive" : "text-muted-foreground")} />
                  <span className="flex-1">{r.name}</span>
                  <Badge variant={ok ? "success" : "destructive"}>{ok ? "Covered" : "Needed"}</Badge>
                </div>
              );
            })}
          </div>
          {codeRoles.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{incident.codeName} roles</p>
              <ul className="space-y-1 text-sm">
                {codeRoles.map((r) => (
                  <li key={r.role} className="flex items-center gap-2">
                    <span className={cn("size-2 rounded-full", r.claimedBy ? "bg-success" : "bg-muted-foreground/40")} />
                    <span className={r.claimedBy ? "" : "text-muted-foreground"}>{r.role}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {messages.length > 0 && (
          <div className="space-y-1.5">
            {messages.map((m, i) => (
              <p key={i} className={cn("rounded-md border px-3 py-2 text-xs",
                m.type === "exposure" ? "border-destructive/40 bg-destructive/10" : m.type === "equipment" ? "border-warning/40 bg-warning/10" : "border-primary/30 bg-primary/5")}>{m.text}</p>
            ))}
          </div>
        )}

        {/* Guidance */}
        <div>
          <button onClick={() => setGuideOpen((o) => !o)} className="mb-2 flex items-center gap-1 text-sm font-medium text-primary">
            <ChevronDown className={cn("size-4 transition-transform", !guideOpen && "-rotate-90")} /> What to do
          </button>
          {guideOpen && <IncidentGuidance codeName={incident.codeName} locationId={incident.locationId} settings={data.settings} locations={data.locations} />}
        </div>

        {/* Responders */}
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Responding ({responses.length})</p>
          {responses.length === 0 ? (
            <p className="text-sm text-muted-foreground">No one yet.</p>
          ) : (
            <ul className="divide-y divide-border rounded-lg border border-border">
              {responses.map((r) => <ResponderRow key={r.id} r={r} isMe={r.userId === user?.id} />)}
            </ul>
          )}
          {available.length > 0 && (
            <p className="mt-2 text-xs text-muted-foreground">
              Online, not yet responding: {available.map((p) => `${p.name}${p.locationId ? ` (${data.locationName(p.locationId) ?? "?"})` : ""}`).join(", ")}
            </p>
          )}
        </div>

        {/* Audio */}
        {code?.audioRecordingEnabled && (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm">
            <Mic className="size-4 text-muted-foreground" />
            <span className="text-muted-foreground">
              {incident.audioClips.length ? `${incident.audioClips.length} clip${incident.audioClips.length === 1 ? "" : "s"} recorded` : "Recording on the triggering device"}
              {" · kept only on admin devices"}
            </span>
            <LiveListen incident={incident} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ResponderRow({ r, isMe }: { r: EmergencyResponse; isMe: boolean }) {
  const last = r.statusUpdates[r.statusUpdates.length - 1];
  return (
    <li className="flex flex-wrap items-start justify-between gap-2 px-3 py-2 text-sm">
      <div className="min-w-0">
        <p className="font-medium">{isMe ? "You" : r.responderName ?? "Someone"} <span className="font-normal text-muted-foreground">· {r.assistanceType || r.responseRole || "Responding"}</span></p>
        <p className="text-xs text-muted-foreground">
          {r.isRemote ? "Remote" : r.estimatedArrival ? `ETA ${r.estimatedArrival}` : "On the way"}
          {r.itemsBringing.length ? ` · bringing ${r.itemsBringing.join(", ")}` : ""}
          {last?.message ? ` · “${last.message}”` : ""}
          {r.distanceMeters ? ` · was ${(r.distanceMeters / 1609).toFixed(1)} mi away` : ""}
        </p>
      </div>
      <Badge variant={STATUS_VARIANT[r.status]}>{STATUS_LABEL[r.status]}</Badge>
    </li>
  );
}

/** One-tap status updates for your own response. */
function MyStatus({ response }: { response: EmergencyResponse }) {
  const update = useUpdate("emergencyResponses");
  const [msg, setMsg] = useState("");
  const set = async (status: ResponseStatus) => {
    const now = new Date().toISOString();
    try {
      await update.mutateAsync({ id: response.id, patch: { status, statusUpdates: [...response.statusUpdates, { status, message: msg, timestamp: now }] } });
      notifyServer({ event: "status", id: response.id });
      setMsg("");
    } catch (e) {
      toast.error(`Couldn't update: ${e instanceof Error ? e.message : "error"}`);
    }
  };
  return (
    <div className="rounded-lg border border-success/40 bg-success/10 p-3">
      <p className="text-sm font-semibold text-success">You&apos;re responding · {STATUS_LABEL[response.status]}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {(["on_site", "standby", "completed"] as const).filter((s) => s !== response.status).map((s) => (
          <Button key={s} size="sm" variant="outline" onClick={() => void set(s)}>{STATUS_LABEL[s]}</Button>
        ))}
        <input className="min-w-40 flex-1 rounded-md border border-border bg-background px-2 text-sm" placeholder="Add a note (optional)" value={msg} onChange={(e) => setMsg(e.target.value)} />
      </div>
    </div>
  );
}
