"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Siren, LifeBuoy, CheckCircle2, History, Settings2, HandHelping, Clock, MapPin, Wifi, WifiOff } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth/context";
import { useUpdate } from "@/lib/data/hooks";
import { useEmergencyData } from "@/lib/emergency-alert/use-emergency";
import { useOrgId, usePresence } from "@/lib/emergency-alert/live";
import { formatWhen, incidentPlace } from "@/lib/emergency-alert/rules";
import { notifyServer } from "@/lib/emergency-alert/push-client";
import type { AssistanceRequest, EmergencyCode, EmergencyIncident } from "@/lib/data/schema";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/shared/states";
import { TriggerDialog } from "@/components/emergency-alert/trigger-dialog";
import { RespondDialog } from "@/components/emergency-alert/respond-dialog";
import { IncidentCard } from "@/components/emergency-alert/incident-card";
import { RequestAssistanceDialog, RespondAssistanceDialog } from "@/components/emergency-alert/assistance-dialogs";
import { MyDay } from "@/components/emergency-alert/my-day";

export default function EmergencyPage() {
  const { user, isAdmin } = useAuth();
  const data = useEmergencyData();
  const orgId = useOrgId();
  const me = useMemo(
    () => (user ? { userId: user.id, name: user.fullName, locationId: data.myLocationId, isAdmin } : null),
    [user, data.myLocationId, isAdmin],
  );
  const online = usePresence(orgId, me);

  const [triggering, setTriggering] = useState<EmergencyCode | null>(null);
  const [responding, setResponding] = useState<EmergencyIncident | null>(null);
  const [asking, setAsking] = useState(false);
  const [helping, setHelping] = useState<AssistanceRequest | null>(null);
  const [now] = useState(() => Date.now());

  if (data.error) return <ErrorState message="Couldn't load emergency data." />;

  const allClear = data.active.length === 0 && data.openAssistance.length === 0;
  const recent = data.incidents.filter((i) => i.resolved && now - new Date(i.triggeredAt).getTime() < 30 * 86_400_000).slice(0, 5);
  const siteCoords = (id: string | null | undefined) => {
    const l = data.locations.find((x) => x.id === id);
    return l?.lat != null && l?.lng != null ? { lat: l.lat, lng: l.lng } : null;
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Emergency"
        description="Call a code, see who's responding, and ask for a hand. Everyone signed in to the Hub is alerted instantly."
        actions={isAdmin ? (
          <>
            <Button asChild variant="outline"><Link href="/emergency/history"><History /> History</Link></Button>
            <Button asChild variant="outline"><Link href="/emergency/setup"><Settings2 /> Setup</Link></Button>
          </>
        ) : undefined}
      />

      {/* Status */}
      <div className={`flex flex-wrap items-center gap-3 rounded-xl border px-4 py-3 ${allClear ? "border-success/40 bg-success/10" : "border-destructive/50 bg-destructive/10"}`}>
        {allClear ? <CheckCircle2 className="size-5 text-success" /> : <Siren className="size-5 animate-pulse text-destructive" />}
        <p className="font-semibold">
          {allClear ? "All clear" : [
            data.active.length && `${data.active.length} active emergenc${data.active.length === 1 ? "y" : "ies"}`,
            data.openAssistance.length && `${data.openAssistance.length} assistance request${data.openAssistance.length === 1 ? "" : "s"}`,
          ].filter(Boolean).join(" · ")}
        </p>
        <span className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground" title="People with the Hub open right now">
          {online.length ? <Wifi className="size-3.5 text-success" /> : <WifiOff className="size-3.5" />} {online.length} online
        </span>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          {/* Trigger */}
          <section aria-labelledby="call-code">
            <h2 id="call-code" className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Call a code</h2>
            {data.loading ? (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24" />)}</div>
            ) : data.codes.length === 0 ? (
              <Card><CardContent className="p-4 text-sm text-muted-foreground">No emergency codes set up yet.{isAdmin ? " Add them in Setup." : " Ask an admin to add them."}</CardContent></Card>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {data.codes.map((c) => (
                  <button key={c.id} onClick={() => setTriggering(c)}
                    className="group flex min-h-24 flex-col items-start justify-between rounded-xl p-3 text-left text-white shadow-sm transition-transform hover:scale-[1.02] focus:outline-none focus:ring-4 focus:ring-ring"
                    style={{ backgroundColor: c.colorHex }}>
                    <Siren className="size-5 opacity-90" />
                    <span>
                      <span className="block text-lg font-bold leading-tight">{c.name}</span>
                      <span className="line-clamp-2 text-[11px] leading-snug opacity-90">{c.description?.split("—")[0]}</span>
                    </span>
                  </button>
                ))}
              </div>
            )}
            <Button variant="outline" className="mt-3 w-full sm:w-auto" onClick={() => setAsking(true)}>
              <LifeBuoy className="text-warning" /> Not an emergency? Request assistance
            </Button>
          </section>

          {/* Active */}
          {data.active.map((i) => (
            <IncidentCard key={i.id} incident={i} data={data} online={online} onRespond={() => setResponding(i)} />
          ))}

          {data.openAssistance.map((a) => <AssistanceCard key={a.id} a={a} onHelp={() => setHelping(a)} />)}

          {/* Recent */}
          {allClear && (
            <section>
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Last 30 days</h2>
              {recent.length === 0 ? (
                <p className="text-sm text-muted-foreground">No incidents.</p>
              ) : (
                <ul className="divide-y divide-border rounded-xl border border-border bg-card">
                  {recent.map((i) => (
                    <li key={i.id} className="flex flex-wrap items-center gap-2 px-4 py-2.5 text-sm">
                      <span className="size-2.5 rounded-full" style={{ backgroundColor: data.allCodes.find((c) => c.id === i.codeId)?.colorHex }} />
                      <span className="font-medium">{i.codeName}</span>
                      {i.isTest && <Badge variant="warning">TEST</Badge>}
                      <span className="text-muted-foreground">{incidentPlace(i)}</span>
                      <span className="ml-auto text-xs text-muted-foreground">{formatWhen(i.triggeredAt)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
        </div>

        <aside className="space-y-4">
          <MyDay data={data} />
        </aside>
      </div>

      {triggering && <TriggerDialog code={triggering} data={data} orgId={orgId} onClose={() => setTriggering(null)} />}
      {responding && (
        <RespondDialog incident={responding} profile={data.myProfile} siteCoords={siteCoords(responding.locationId)} orgId={orgId} onClose={() => setResponding(null)} />
      )}
      {asking && <RequestAssistanceDialog data={data} orgId={orgId} onClose={() => setAsking(false)} />}
      {helping && <RespondAssistanceDialog request={helping} onClose={() => setHelping(null)} />}
    </div>
  );
}

function AssistanceCard({ a, onHelp }: { a: AssistanceRequest; onHelp: () => void }) {
  const { user, isAdmin } = useAuth();
  const update = useUpdate("assistanceRequests");
  const mine = a.requestedBy === user?.id;
  const helping = a.responders.some((r) => r.userId === user?.id);
  const resolve = async () => {
    if (!user) return;
    try {
      await update.mutateAsync({ id: a.id, patch: { resolved: true, resolvedAt: new Date().toISOString(), resolvedByName: user.fullName } });
      notifyServer({ event: "assistance_resolved", id: a.id });
    } catch (e) {
      toast.error(`Couldn't update: ${e instanceof Error ? e.message : "error"}`);
    }
  };
  return (
    <Card className="border-warning/50">
      <CardContent className="space-y-3 p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="flex items-center gap-2 font-semibold"><LifeBuoy className="size-4 text-warning" /> {a.assistanceType}
              <Badge variant={a.urgency === "now" ? "destructive" : "warning"}>{a.urgency === "now" ? "Now" : "Within 5 min"}</Badge></p>
            <p className="mt-1 flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
              {a.requestedByName}{a.locationName && <><MapPin className="size-3.5" />{a.locationName}</>}<Clock className="size-3.5" />{formatWhen(a.createdDate)}
            </p>
            {a.notes && <p className="mt-1 text-sm">{a.notes}</p>}
          </div>
          {(mine || isAdmin) && <Button size="sm" variant="outline" onClick={() => void resolve()}><CheckCircle2 /> Handled</Button>}
        </div>
        {a.responders.length > 0 && (
          <p className="text-sm">Coming: {a.responders.map((r) => `${r.userId === user?.id ? "You" : r.name}${r.eta ? ` (${r.eta})` : ""}`).join(", ")}</p>
        )}
        {!mine && !helping && <Button size="sm" onClick={onHelp}><HandHelping /> I&apos;ll help</Button>}
      </CardContent>
    </Card>
  );
}
