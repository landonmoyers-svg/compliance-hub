"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ChevronRight, Mic, Timer, Users, Search, FileWarning } from "lucide-react";
import { useCollection } from "@/lib/data/hooks";
import { useEmergencyData } from "@/lib/emergency-alert/use-emergency";
import { formatWhen, incidentPlace, minutesBetween } from "@/lib/emergency-alert/rules";
import type { EmergencyIncident } from "@/lib/data/schema";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/states";
import { DeviceLibrary } from "@/components/emergency-alert/audio/device-library";
import { cn } from "@/lib/cn";

/** Every incident, what happened, how fast people responded — and the audio kept on this device. */
export default function EmergencyHistoryPage() {
  const data = useEmergencyData();
  const logQ = useCollection("emergencyAudioLog");
  const [q, setQ] = useState("");
  const [showTests, setShowTests] = useState(true);
  const [open, setOpen] = useState<string | null>(null);

  const list = useMemo(() => data.incidents.filter((i) =>
    (showTests || !i.isTest) &&
    (!q || `${i.codeName} ${i.locationName} ${i.triggeredByName} ${i.internalLocation} ${i.notes}`.toLowerCase().includes(q.toLowerCase())),
  ), [data.incidents, q, showTests]);

  const real = data.incidents.filter((i) => !i.isTest);
  const firstResponse = (i: EmergencyIncident) => data.responsesFor(i.id)[0]?.respondedAt;
  const responseTimes = real.map((i) => firstResponse(i) && minutesBetween(i.triggeredAt, firstResponse(i)!)).filter((m): m is number => typeof m === "number");
  const median = responseTimes.length ? responseTimes.sort((a, b) => a - b)[Math.floor(responseTimes.length / 2)] : null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Incident history"
        description="Every emergency called in the Hub (and imported from LP Alert). Audio is listed only where this device holds it."
        actions={<Button asChild variant="outline"><Link href="/emergency"><ArrowLeft /> Emergency</Link></Button>}
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Incidents (real)" value={real.length} />
        <StatCard label="Drills / tests" value={data.incidents.length - real.length} />
        <StatCard label="Median time to first responder" value={median === null ? "—" : `${median} min`} />
        <StatCard label="Audio clips recorded" value={data.incidents.reduce((n, i) => n + i.audioClips.length, 0)} />
      </div>

      <div className="jane-filterbar">
        <label className="flex flex-1 items-center gap-2">
          <Search className="size-4 text-muted-foreground" />
          <input className="w-full bg-transparent text-sm focus:outline-none" placeholder="Search code, site, person, notes…" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={showTests} onChange={(e) => setShowTests(e.target.checked)} /> Include tests</label>
      </div>

      {data.loading ? <Skeleton className="h-64" /> : list.length === 0 ? (
        <EmptyState title="No incidents" description="Nothing matches." />
      ) : (
        <ul className="space-y-2">
          {list.map((i) => {
            const responses = data.responsesFor(i.id);
            const color = data.allCodes.find((c) => c.id === i.codeId)?.colorHex;
            const first = firstResponse(i);
            const isOpen = open === i.id;
            return (
              <li key={i.id}>
                <Card>
                  <button className="flex w-full flex-wrap items-center gap-2 px-4 py-3 text-left" onClick={() => setOpen(isOpen ? null : i.id)} aria-expanded={isOpen}>
                    <ChevronRight className={cn("size-4 shrink-0 transition-transform", isOpen && "rotate-90")} />
                    <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
                    <span className="font-semibold">{i.codeName}</span>
                    {i.isTest && <Badge variant="warning">TEST</Badge>}
                    {!i.resolved && <Badge variant="destructive">ACTIVE</Badge>}
                    <span className="text-sm text-muted-foreground">{incidentPlace(i)}{i.internalLocation ? ` · ${i.internalLocation}` : ""}</span>
                    <span className="ml-auto flex items-center gap-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1"><Users className="size-3.5" />{responses.length}</span>
                      {i.audioClips.length > 0 && <span className="flex items-center gap-1"><Mic className="size-3.5" />{i.audioClips.length}</span>}
                      {i.resolvedAt && <span className="flex items-center gap-1"><Timer className="size-3.5" />{minutesBetween(i.triggeredAt, i.resolvedAt)} min</span>}
                      {formatWhen(i.triggeredAt)}
                    </span>
                  </button>
                  {isOpen && (
                    <CardContent className="space-y-4 border-t border-border p-4 text-sm">
                      <dl className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
                        <Row k="Triggered by" v={`${i.triggeredByName ?? "—"} · ${formatWhen(i.triggeredAt)}`} />
                        <Row k="Resolved" v={i.resolved ? `${i.resolvedByName ?? "—"} · ${formatWhen(i.resolvedAt)}` : "Still active"} />
                        <Row k="First responder" v={first ? `${minutesBetween(i.triggeredAt, first)} min after trigger` : "None recorded"} />
                        {i.evacuationStatus !== "pending" && <Row k="Directive" v={i.evacuationStatus === "evacuate" ? "Evacuate" : "Shelter in place"} />}
                        {i.notes && <Row k="Notes" v={i.notes} />}
                      </dl>

                      <div>
                        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Timeline</p>
                        <ol className="space-y-1 border-l border-border pl-4">
                          <li><span className="text-muted-foreground">{time(i.triggeredAt)}</span> — {i.codeName} called by {i.triggeredByName ?? "someone"}</li>
                          {responses.flatMap((r) => r.statusUpdates.map((u, n) => ({ at: u.timestamp, text: n === 0
                            ? `${r.responderName ?? "Someone"} responding${r.assistanceType ? ` as ${r.assistanceType}` : ""}${r.isRemote ? " (remote)" : ""}${u.message ? ` — “${u.message}”` : ""}`
                            : `${r.responderName ?? "Someone"}: ${u.status.replace("_", " ")}${u.message ? ` — “${u.message}”` : ""}` })))
                            .sort((a, b) => a.at.localeCompare(b.at))
                            .map((e, n) => <li key={n}><span className="text-muted-foreground">{time(e.at)}</span> — {e.text}</li>)}
                          {i.resolvedAt && <li><span className="text-muted-foreground">{time(i.resolvedAt)}</span> — resolved by {i.resolvedByName ?? "—"}</li>}
                        </ol>
                      </div>

                      {i.audioClips.length > 0 && (
                        <div className="space-y-2">
                          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Audio</p>
                          <p className="text-xs text-muted-foreground">
                            {i.audioClips.length} clip{i.audioClips.length === 1 ? "" : "s"} recorded. Held by: {Array.from(new Set(i.audioClips.map((c) => c.heldBy ?? "the triggering phone (not yet handed off)"))).join("; ")}.
                          </p>
                          {i.audioClips.some((c) => c.heldBy?.startsWith("Base44")) && (
                            <p className="flex items-start gap-1.5 rounded-md border border-warning/40 bg-warning/10 px-2 py-1.5 text-xs">
                              <FileWarning className="mt-0.5 size-3.5 shrink-0" /> These LP Alert recordings are still in Base44&apos;s cloud. Download them to an admin computer from LP Alert, then delete them there.
                            </p>
                          )}
                          <DeviceLibrary incidentId={i.id} />
                        </div>
                      )}
                    </CardContent>
                  )}
                </Card>
              </li>
            );
          })}
        </ul>
      )}

      <section className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Audio access log</h2>
        {(logQ.data ?? []).length === 0 ? <p className="text-sm text-muted-foreground">No audio has been listened to, saved or deleted yet.</p> : (
          <ul className="divide-y divide-border rounded-lg border border-border bg-card text-sm">
            {[...(logQ.data ?? [])].sort((a, b) => b.createdDate.localeCompare(a.createdDate)).slice(0, 50).map((l) => (
              <li key={l.id} className="flex flex-wrap gap-2 px-3 py-2">
                <span className="font-medium">{l.performedByName}</span>
                <span>{l.action.replace(/_/g, " ")}</span>
                {l.clipIndex != null && <span className="text-muted-foreground">clip {l.clipIndex + 1}</span>}
                <span className="text-muted-foreground">{l.incidentLabel}</span>
                <span className="ml-auto text-xs text-muted-foreground">{l.deviceLabel ? `${l.deviceLabel} · ` : ""}{formatWhen(l.createdDate)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return <div className="flex gap-2"><dt className="w-32 shrink-0 text-muted-foreground">{k}</dt><dd>{v}</dd></div>;
}
function time(iso: string) {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", second: "2-digit" });
}
