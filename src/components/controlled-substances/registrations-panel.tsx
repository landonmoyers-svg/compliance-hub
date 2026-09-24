"use client";

/**
 * The DEA registrations the practice keeps records under.
 *
 * This is the spine of the controlled-substance archive: every filed log
 * points at one of these, folders are named for them, and reconciliation never
 * crosses from one to another. Nothing can be filed until at least one exists.
 *
 * A registration is a number, a holder, an address and a span of time. All
 * four matter — a DEA number is tied to an address, so one prescriber holds a
 * different number at each site, and when a location registration takes over,
 * the individual one retires rather than disappearing. Retired registrations
 * stay here and stay filable: the registrant remains responsible for what was
 * kept under their number, and a correction can be required years later.
 */

import { useMemo, useState } from "react";
import { BadgeCheck, Building2, Loader2, Paperclip, Pencil, Plus, Printer, TriangleAlert, Upload, User, X } from "lucide-react";
import { FileLink } from "@/components/shared/file-link";
import { uploadFile } from "@/lib/storage";
import { isExpired } from "@/lib/dates";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { checkDeaNumber, formatDeaNumber } from "@/lib/dea-number";
import { formatDate, dateInputToISO } from "@/lib/dates";
import type { DeaRegistration } from "@/lib/data/schema";

export interface RegistrationDraft {
  deaNumber: string;
  registrantName: string;
  registrantType: "individual" | "location";
  locationId: string;
  recordsFrom: string | null;
  effectiveFrom: string | null;
  expiresOn: string | null;
  retiredOn: string | null;
  schedules: string | null;
  notes: string | null;
  documentUrl: string | null;
}

const toInput = (iso: string | null | undefined) => (iso ? iso.slice(0, 10) : "");

function Editor({ locations, existing, onClose, onSave, saving }: {
  locations: { id: string; name: string }[];
  existing: DeaRegistration | null;
  onClose: () => void;
  onSave: (d: RegistrationDraft, id: string | null) => void;
  saving: boolean;
}) {
  const [deaNumber, setDeaNumber] = useState(existing?.deaNumber ?? "");
  const [registrantName, setRegistrantName] = useState(existing?.registrantName ?? "");
  const [registrantType, setRegistrantType] = useState<"individual" | "location">(existing?.registrantType ?? "individual");
  const [locationId, setLocationId] = useState(existing?.locationId ?? locations[0]?.id ?? "");
  const [recordsFrom, setRecordsFrom] = useState(toInput(existing?.recordsFrom));
  const [effectiveFrom, setEffectiveFrom] = useState(toInput(existing?.effectiveFrom));
  const [expiresOn, setExpiresOn] = useState(toInput(existing?.expiresOn));
  const [retiredOn, setRetiredOn] = useState(toInput(existing?.retiredOn));
  const [documentUrl, setDocumentUrl] = useState(existing?.documentUrl ?? "");
  const [uploading, setUploading] = useState(false);

  async function attach(file: File) {
    setUploading(true);
    try {
      // The certificate names the registrant, the address and the schedules —
      // and no patient. A business record, so the Hub's own storage is right;
      // this is not one of the documents that has to live in SharePoint.
      setDocumentUrl(await uploadFile(file, "dea-registrations"));
      toast.success("Certificate attached");
    } catch (err) {
      // Say what actually went wrong. "Couldn't upload that file" sends
      // somebody to retry the same thing, when the answer is usually in the
      // message — a size limit, a rejected type, a permission.
      toast.error(err instanceof Error ? err.message : "Couldn't upload that file.");
    } finally {
      setUploading(false);
    }
  }
  const [schedules, setSchedules] = useState(existing?.schedules ?? "");
  const [notes, setNotes] = useState(existing?.notes ?? "");

  const check = useMemo(() => checkDeaNumber(deaNumber), [deaNumber]);
  const canSave = !!deaNumber.trim() && !!registrantName.trim() && !!locationId && !saving;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-border bg-card shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="font-semibold">{existing ? "Edit registration" : "Add a DEA registration"}</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="size-4" /></button>
        </div>

        <div className="space-y-4 p-5">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">DEA number</label>
            <input
              className="input w-full font-mono uppercase" value={deaNumber}
              onChange={(e) => setDeaNumber(formatDeaNumber(e.target.value))}
              placeholder="AB1234563"
            />
            {check.problem && (
              <p className="flex items-start gap-1.5 text-xs text-warning">
                <TriangleAlert className="mt-0.5 size-3.5 shrink-0" /> {check.problem}
              </p>
            )}
            {check.wellFormed && check.checkDigitValid && (
              <p className="flex items-center gap-1.5 text-xs text-success"><BadgeCheck className="size-3.5" /> Check digit is right</p>
            )}
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">Registered to</label>
            <div className="flex flex-wrap gap-2 pb-1">
              {([["individual", "A person", User], ["location", "The practice", Building2]] as const).map(([value, label, Icon]) => (
                <button
                  key={value} type="button" onClick={() => setRegistrantType(value)}
                  className={`flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm ${registrantType === value ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-secondary/40"}`}
                >
                  <Icon className="size-3.5" /> {label}
                </button>
              ))}
            </div>
            <input
              className="input w-full" value={registrantName} onChange={(e) => setRegistrantName(e.target.value)}
              placeholder={registrantType === "individual" ? "e.g. Jane Bentley, MD" : "e.g. Lone Peak Psychiatry"}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">Registered address</label>
            <select className="input w-full" value={locationId} onChange={(e) => setLocationId(e.target.value)}>
              {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
            <p className="text-[11px] text-muted-foreground">A DEA number is tied to one address — the same person holds a different number at each site.</p>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">Our records start</label>
            <input type="date" className="input w-full" value={recordsFrom} onChange={(e) => setRecordsFrom(e.target.value)} />
            <p className="text-[11px] text-muted-foreground">
              When this practice became answerable for what is kept under this number — usually when it opened, or when the registration moved to this address. A number renews every three years and follows the registrant, so it can be older than the practice; reconciliation measures from this date, not the certificate.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Current term from</label>
              <input type="date" className="input w-full" value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Expires on</label>
              <input type="date" className="input w-full" value={expiresOn} onChange={(e) => setExpiresOn(e.target.value)} />
              <p className="text-[11px] text-muted-foreground">Both as printed on the current certificate.</p>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Retired on</label>
              <input type="date" className="input w-full" value={retiredOn} onChange={(e) => setRetiredOn(e.target.value)} />
              <p className="text-[11px] text-muted-foreground">Leave empty while it&apos;s in use. Different from expiring.</p>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">Certificate</label>
            <label className="flex cursor-pointer items-center gap-2 rounded-md border border-dashed border-border bg-secondary/10 px-3 py-2 text-sm text-muted-foreground hover:bg-secondary/20">
              {uploading ? <Loader2 className="size-4 animate-spin text-primary" /> : documentUrl ? <Paperclip className="size-4" /> : <Upload className="size-4" />}
              {uploading ? "Uploading…" : documentUrl ? "Attached — choose another to replace it" : "Attach the DEA registration certificate"}
              <input
                // No accept filter: a certificate arrives as a PDF, a photo, a
                // scan, or whatever the DEA portal handed over, and a filter
                // that greys out the real file looks like a broken button.
                type="file" className="hidden" disabled={uploading}
                onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void attach(f); }}
              />
            </label>
            {documentUrl && <FileLink path={documentUrl} label="View the attached certificate" className="text-xs text-primary hover:underline" />}
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">Schedules</label>
            <input className="input w-full" value={schedules} onChange={(e) => setSchedules(e.target.value)} placeholder="e.g. II, III, IV, V" />
          </div>

          <textarea
            className="input w-full resize-none" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)}
            placeholder="Anything worth knowing later — when it replaced another registration, why it retired."
          />

          {retiredOn && (
            <p className="rounded-md bg-secondary/40 px-3 py-2 text-xs text-muted-foreground">
              A retired registration keeps its records and can still be amended — by supervisors. It stops being offered for routine filing.
            </p>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button
            disabled={!canSave}
            onClick={() => onSave({
              deaNumber: formatDeaNumber(deaNumber),
              registrantName: registrantName.trim(),
              registrantType,
              locationId,
              recordsFrom: recordsFrom ? dateInputToISO(recordsFrom) : null,
              effectiveFrom: effectiveFrom ? dateInputToISO(effectiveFrom) : null,
              expiresOn: expiresOn ? dateInputToISO(expiresOn) : null,
              retiredOn: retiredOn ? dateInputToISO(retiredOn) : null,
              documentUrl: documentUrl || null,
              schedules: schedules.trim() || null,
              notes: notes.trim() || null,
            }, existing?.id ?? null)}
          >
            {saving ? "Saving…" : existing ? "Save changes" : "Add registration"}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function RegistrationsPanel({ registrations, locations, canManage, canPrintPack, onSave, onPrintPack, saving }: {
  registrations: DeaRegistration[];
  locations: { id: string; name: string }[];
  canManage: boolean;
  /** Producing the pack means producing the practice's record of a registration. */
  canPrintPack: boolean;
  onSave: (d: RegistrationDraft, id: string | null) => void;
  onPrintPack: (registration: DeaRegistration) => void;
  saving: boolean;
}) {
  const [editing, setEditing] = useState<DeaRegistration | null>(null);
  const [adding, setAdding] = useState(false);

  const byLocation = useMemo(() => {
    const names = new Map(locations.map((l) => [l.id, l.name]));
    const groups = new Map<string, DeaRegistration[]>();
    for (const r of registrations) {
      const key = names.get(r.locationId) ?? "Unknown site";
      const g = groups.get(key);
      if (g) g.push(r); else groups.set(key, [r]);
    }
    // In use first, then most recently retired — the current number is the one
    // someone is usually looking for.
    for (const g of groups.values()) {
      g.sort((a, b) => Number(!!a.retiredOn) - Number(!!b.retiredOn)
        || (b.effectiveFrom ?? "").localeCompare(a.effectiveFrom ?? ""));
    }
    return [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [registrations, locations]);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle className="text-sm">DEA registrations</CardTitle>
            <p className="text-xs text-muted-foreground">
              Records are kept per registration. A number is tied to one address, so each site has its own — and a retired one keeps its records.
            </p>
          </div>
          {canManage && (
            <Button variant="outline" size="sm" onClick={() => setAdding(true)}><Plus className="size-4" /> Registration</Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {registrations.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No registrations yet. Add the DEA numbers the practice holds — logs can&apos;t be filed until one exists.
          </p>
        ) : (
          byLocation.map(([site, regs]) => (
            <div key={site} className="space-y-1.5">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{site}</p>
              {regs.map((r) => {
                const check = checkDeaNumber(r.deaNumber);
                return (
                  <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-2">
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-2 text-sm">
                        <span className="font-mono font-medium">{r.deaNumber}</span>
                        <span className="text-muted-foreground">{r.registrantName}</span>
                        {r.registrantType === "location"
                          ? <Badge variant="secondary"><Building2 className="size-3" /> Practice</Badge>
                          : <Badge variant="secondary"><User className="size-3" /> Individual</Badge>}
                        {r.retiredOn ? <Badge variant="outline">Retired {formatDate(r.retiredOn)}</Badge> : <Badge variant="success">In use</Badge>}
                        {!r.retiredOn && r.expiresOn && isExpired(r.expiresOn) && (
                          <Badge variant="warning"><TriangleAlert className="size-3" /> Expired {formatDate(r.expiresOn)}</Badge>
                        )}
                        {!check.checkDigitValid && check.wellFormed && (
                          <Badge variant="warning"><TriangleAlert className="size-3" /> Check digit</Badge>
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {r.recordsFrom ? `Records from ${formatDate(r.recordsFrom)}` : "No record start date"}
                        {r.effectiveFrom ? ` · term from ${formatDate(r.effectiveFrom)}` : ""}
                        {r.expiresOn ? ` · Renews ${formatDate(r.expiresOn)}` : ""}
                        {r.schedules ? ` · Schedules ${r.schedules}` : ""}
                      </p>
                      {r.documentUrl
                        ? <FileLink path={r.documentUrl} label="Certificate" className="text-xs text-primary hover:underline" />
                        : <span className="text-xs text-muted-foreground">No certificate attached</span>}
                    </div>
                    <div className="flex items-center gap-1">
                      {canPrintPack && (
                        <Button
                          variant="ghost" size="sm" onClick={() => onPrintPack(r)}
                          title="Everything kept under this number, as one printable document"
                        >
                          <Printer className="size-3.5" /> Record pack
                        </Button>
                      )}
                      {canManage && (
                        <Button variant="ghost" size="sm" onClick={() => setEditing(r)}><Pencil className="size-3.5" /> Edit</Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ))
        )}
      </CardContent>

      {(adding || editing) && (
        <Editor
          locations={locations}
          existing={editing}
          saving={saving}
          onClose={() => { setAdding(false); setEditing(null); }}
          onSave={(d, id) => { onSave(d, id); setAdding(false); setEditing(null); }}
        />
      )}
    </Card>
  );
}
