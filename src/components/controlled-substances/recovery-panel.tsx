"use client";

/**
 * How far the reconstruction has got.
 *
 * Rebuilding controlled-substance records that were never kept is weeks of
 * requesting things from distributors and waiting. The question that matters
 * throughout is not "what have we got" but "what is there still nothing for",
 * so that is what this leads with: the gaps, per registration, named by date.
 *
 * A requested period is deliberately still shown as a gap. It's marked as
 * being chased, but it is not coverage — treating a request as a record is how
 * a reconstruction declares itself finished while holding nothing.
 */

import { useMemo, useState } from "react";
import { CircleDashed, Clock, FileSearch, Plus, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDate, dateInputToISO, todayInput } from "@/lib/dates";
import { recoveryPicture, type Span } from "@/lib/cs-archive/recovery";
import { recordRecoveryKinds, recordRecoveryStatuses } from "@/lib/data/schema";
import type { DeaRegistration, RecordRecoveryItem } from "@/lib/data/schema";

export interface RecoveryDraft {
  registrationId: string;
  recordKind: RecordRecoveryItem["recordKind"];
  sourceName: string | null;
  periodStart: string;
  periodEnd: string;
  status: RecordRecoveryItem["status"];
  requestedOn: string | null;
  receivedOn: string | null;
  notes: string | null;
}

const KIND_LABEL: Record<RecordRecoveryItem["recordKind"], string> = {
  purchase: "Purchases / receipts",
  administration: "Administration logs",
  inventory: "Inventories",
  destruction: "Destruction / disposal",
  other: "Other",
};

const STATUS_LABEL: Record<RecordRecoveryItem["status"], string> = {
  missing: "Missing",
  requested: "Requested",
  recovered: "Recovered",
  not_applicable: "Nothing to keep",
};

const STATUS_VARIANT: Record<RecordRecoveryItem["status"], "warning" | "outline" | "success" | "secondary"> = {
  missing: "warning",
  requested: "outline",
  recovered: "success",
  not_applicable: "secondary",
};

const spanLabel = (s: Span) => `${formatDate(s.start)} – ${formatDate(s.end)}`;

function Editor({ registrations, existing, onClose, onSave, saving }: {
  registrations: { id: string; label: string }[];
  existing: RecordRecoveryItem | null;
  onClose: () => void;
  onSave: (d: RecoveryDraft, id: string | null) => void;
  saving: boolean;
}) {
  const [registrationId, setRegistrationId] = useState(existing?.registrationId ?? registrations[0]?.id ?? "");
  const [recordKind, setRecordKind] = useState<RecordRecoveryItem["recordKind"]>(existing?.recordKind ?? "purchase");
  const [sourceName, setSourceName] = useState(existing?.sourceName ?? "");
  const [periodStart, setPeriodStart] = useState(existing?.periodStart?.slice(0, 10) ?? "");
  const [periodEnd, setPeriodEnd] = useState(existing?.periodEnd?.slice(0, 10) ?? "");
  const [status, setStatus] = useState<RecordRecoveryItem["status"]>(existing?.status ?? "missing");
  const [requestedOn, setRequestedOn] = useState(existing?.requestedOn?.slice(0, 10) ?? "");
  const [receivedOn, setReceivedOn] = useState(existing?.receivedOn?.slice(0, 10) ?? "");
  const [notes, setNotes] = useState(existing?.notes ?? "");

  const valid = registrationId && periodStart && periodEnd && periodEnd >= periodStart;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-border bg-card shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="font-semibold">{existing ? "Update this period" : "Record a period"}</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="size-4" /></button>
        </div>

        <div className="space-y-4 p-5">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Registration</label>
            <select className="input w-full" value={registrationId} onChange={(e) => setRegistrationId(e.target.value)}>
              {registrations.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Kind of record</label>
              <select className="input w-full" value={recordKind} onChange={(e) => setRecordKind(e.target.value as RecordRecoveryItem["recordKind"])}>
                {recordRecoveryKinds.map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">State</label>
              <select className="input w-full" value={status} onChange={(e) => setStatus(e.target.value as RecordRecoveryItem["status"])}>
                {recordRecoveryStatuses.map((k) => <option key={k} value={k}>{STATUS_LABEL[k]}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Period start</label>
              <input type="date" className="input w-full" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Period end</label>
              <input type="date" className="input w-full" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">Where it comes from</label>
            <input className="input w-full" value={sourceName} onChange={(e) => setSourceName(e.target.value)} placeholder="the distributor, or where the paperwork was found" />
          </div>

          {(status === "requested" || status === "recovered") && (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Requested on</label>
                <input type="date" className="input w-full" value={requestedOn} onChange={(e) => setRequestedOn(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Received on</label>
                <input type="date" className="input w-full" value={receivedOn} onChange={(e) => setReceivedOn(e.target.value)} />
              </div>
            </div>
          )}

          <textarea
            className="input w-full resize-none" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)}
            placeholder="Who you asked, what they said, what's still outstanding."
          />

          {status === "not_applicable" && (
            <p className="rounded-md bg-secondary/40 px-3 py-2 text-xs text-muted-foreground">
              Use this when there was genuinely nothing to keep for the period — no orders placed, no treatments given. It counts as covered rather than as a hole.
            </p>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button
            disabled={!valid || saving}
            onClick={() => onSave({
              registrationId, recordKind,
              sourceName: sourceName.trim() || null,
              // Guarded by `valid` above: both dates are present here.
              periodStart: dateInputToISO(periodStart)!,
              periodEnd: dateInputToISO(periodEnd)!,
              status,
              requestedOn: requestedOn ? dateInputToISO(requestedOn) : null,
              receivedOn: receivedOn ? dateInputToISO(receivedOn) : null,
              notes: notes.trim() || null,
            }, existing?.id ?? null)}
          >
            {saving ? "Saving…" : existing ? "Save" : "Add"}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function RecoveryPanel({ registrations, items, locationName, canManage, onSave, saving }: {
  registrations: DeaRegistration[];
  items: RecordRecoveryItem[];
  locationName: (locationId: string) => string;
  canManage: boolean;
  onSave: (d: RecoveryDraft, id: string | null) => void;
  saving: boolean;
}) {
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<RecordRecoveryItem | null>(null);
  const today = useMemo(() => todayInput(), []);

  const options = registrations.map((r) => ({
    id: r.id,
    label: `${locationName(r.locationId)} · DEA ${r.deaNumber} (${r.registrantName})`,
  }));

  if (registrations.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle className="text-sm">Rebuilding the record</CardTitle>
            <p className="text-xs text-muted-foreground">
              What each registration is still missing. A period that has been requested but hasn&apos;t arrived is still a gap — one that&apos;s being chased.
            </p>
          </div>
          {canManage && (
            <Button variant="outline" size="sm" onClick={() => setAdding(true)}><Plus className="size-4" /> Period</Button>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        {registrations.map((reg) => {
          const label = `${locationName(reg.locationId)} · DEA ${reg.deaNumber}`;
          return (
            <div key={reg.id} className="space-y-3">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>

              {recordRecoveryKinds
                .filter((kind) => items.some((i) => i.registrationId === reg.id && i.recordKind === kind) || kind === "purchase")
                .map((kind) => {
                  const forKind = items.filter((i) => i.registrationId === reg.id && i.recordKind === kind);
                  const picture = recoveryPicture(forKind, reg, today);

                  return (
                    <div key={kind} className="rounded-md border border-border p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm font-medium">{KIND_LABEL[kind]}</p>
                        {picture.coverage === null ? (
                          <Badge variant="secondary">No start date on the registration</Badge>
                        ) : picture.gaps.length === 0 ? (
                          <Badge variant="success">Complete</Badge>
                        ) : (
                          <Badge variant="warning">{Math.round(picture.coverage * 100)}% covered</Badge>
                        )}
                      </div>

                      {picture.whole && (
                        <p className="pt-0.5 text-[11px] text-muted-foreground">
                          Needs covering {spanLabel(picture.whole)}
                          {!reg.retiredOn && " (still in use, so up to today)"}
                        </p>
                      )}

                      {picture.gaps.length > 0 && (
                        <div className="space-y-1 pt-2">
                          <p className="flex items-center gap-1.5 text-xs font-medium text-warning">
                            <FileSearch className="size-3.5" /> Nothing for
                          </p>
                          <ul className="space-y-0.5 pl-5 text-xs text-muted-foreground">
                            {picture.gaps.map((g) => {
                              const chased = picture.inFlight.some((f) => f.start <= g.end && f.end >= g.start);
                              return (
                                <li key={`${g.start}-${g.end}`} className="list-disc">
                                  {spanLabel(g)}
                                  {chased && <span className="ml-1.5 text-primary"><Clock className="inline size-3" /> being chased</span>}
                                </li>
                              );
                            })}
                          </ul>
                        </div>
                      )}

                      {forKind.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 pt-2">
                          {forKind
                            .slice()
                            .sort((a, b) => a.periodStart.localeCompare(b.periodStart))
                            .map((i) => (
                              <button
                                key={i.id}
                                onClick={() => canManage && setEditing(i)}
                                className={`rounded-md border border-border px-2 py-1 text-[11px] ${canManage ? "hover:bg-secondary/40" : "cursor-default"}`}
                              >
                                <Badge variant={STATUS_VARIANT[i.status]}>{STATUS_LABEL[i.status]}</Badge>
                                <span className="ml-1.5 text-muted-foreground">
                                  {spanLabel({ start: i.periodStart, end: i.periodEnd })}
                                  {i.sourceName ? ` · ${i.sourceName}` : ""}
                                </span>
                              </button>
                            ))}
                        </div>
                      )}

                      {forKind.length === 0 && (
                        <p className="flex items-center gap-1.5 pt-2 text-xs text-muted-foreground">
                          <CircleDashed className="size-3.5" /> Nothing recorded yet — the whole span is unaccounted for.
                        </p>
                      )}
                    </div>
                  );
                })}
            </div>
          );
        })}
      </CardContent>

      {(adding || editing) && (
        <Editor
          registrations={options}
          existing={editing}
          saving={saving}
          onClose={() => { setAdding(false); setEditing(null); }}
          onSave={(d, id) => { onSave(d, id); setAdding(false); setEditing(null); }}
        />
      )}
    </Card>
  );
}
