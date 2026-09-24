"use client";

/**
 * Filing a paper controlled-substance log.
 *
 * The pages are read ON THIS DEVICE — Apple Vision in the Mac app, Tesseract in
 * WebAssembly everywhere else — so a page carrying patient chart numbers is
 * never uploaded to the Hub's servers to be read. What comes back is split in
 * two, and the split is the whole point of this screen:
 *
 *   • the FULL record, chart numbers and all, goes straight from this browser
 *     to SharePoint, which the practice's Microsoft agreement covers;
 *   • the DE-IDENTIFIED entries go to the Hub, which is all reconciling a vial
 *     needs and carries nothing that identifies a patient.
 *
 * SharePoint is written FIRST, deliberately. If Microsoft refuses — because
 * this person has no access to the folder — nothing is recorded in the Hub
 * either, so there can be no Hub record pointing at a file that was never
 * written. The folder's own permissions end up gating who can file, which is
 * the gate that holds even if the Hub's roles drift.
 *
 * Nothing here decides anything on its own. Reading handwriting is not a solved
 * problem, so every row is shown for a person to correct before it is saved.
 */

import { useMemo, useState } from "react";
import { AlertTriangle, Check, FileText, FolderOpen, Loader2, Lock, Scan, Upload, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth/context";
import { auditLogMovement } from "@/lib/cs-archive/audit";
import { localOcrAvailable, ocrEngine, readPageLocally, releaseOcr, rowsToText } from "@/lib/cs-archive/local-ocr";
import { fullRecordCsv, hubEntries, parsePage, type ParsedRow } from "@/lib/cs-archive/parse-entries";
import { reconcile } from "@/lib/cs-archive/reconcile";
import { checkQuantities } from "@/lib/cs-archive/quantities";
import { folderLabel, hashFile, inboxFileName, newArchiveKey } from "@/lib/cs-archive/archive-names";
import { csEntryActions, csEntryBases, type CsArchiveEntry, type DeaRecordType } from "@/lib/data/schema";
import { dateInputToISO, todayInput } from "@/lib/dates";
import {
  msConfigured, msResolveUrl, msUpload, rememberedFolder, rememberFolder,
  type DriveItemRef,
} from "@/lib/ms-graph";
import { toast } from "sonner";

export interface PaperLogPayload {
  /** Set when this filing corrects one already on file. */
  amendsRecordId?: string | null;
  amendmentReason?: string | null;
  recordType: DeaRecordType;
  substanceName: string;
  unit: string;
  recordDate: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  locationId: string | null;
  openingBalance: number | null;
  closingBalance: number | null;
  containsPatientIdentifiers: boolean;
  externalUrl: string | null;
  externalSystem: string | null;
  registrationId: string | null;
  directedByName: string | null;
  archiveKey: string;
  fileHashes: Record<string, string>;
  entries: CsArchiveEntry[];
  notes?: string;
}

const LOG_TYPES: { value: DeaRecordType; label: string }[] = [
  { value: "vial_log", label: "Vial log" },
  { value: "administration_log", label: "Administration log" },
  { value: "count_sheet", label: "Count sheet" },
];

function fileToBase64(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () => reject(new Error("Couldn't open that file."));
    reader.readAsDataURL(file);
  });
}

const numOrNull = (v: string) => (v.trim() === "" ? null : Number(v));

export interface FilingRegistration {
  id: string;
  label: string;          // "Murray Clinic 1 · DEA AB1234563 (Landon Moyers)"
  registrantName: string;
  locationId: string;
  registrantType: "individual" | "location";
  retired: boolean;
}

export function PaperLogDialog({ locations, registrations, amendable, onClose, onSave }: {
  locations: { id: string; name: string }[];
  /** The DEA registrations this person may file against. */
  registrations: FilingRegistration[];
  /** Logs already on file that this one could be correcting. */
  amendable: { id: string; label: string; archiveKey?: string | null; folderLabel?: string | null }[];
  onClose: () => void;
  onSave: (p: PaperLogPayload) => Promise<void>;
}) {
  const { profile } = useAuth();

  const [files, setFiles] = useState<File[]>([]);
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [reading, setReading] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [recordType, setRecordType] = useState<DeaRecordType>("administration_log");
  const [substanceName, setSubstanceName] = useState("Ketamine");
  const [unit, setUnit] = useState("mg");
  const [recordDate, setRecordDate] = useState(todayInput());
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [opening, setOpening] = useState("");
  const [closing, setClosing] = useState("");
  const [registrationId, setRegistrationId] = useState(registrations[0]?.id ?? "");
  const [directedByName, setDirectedByName] = useState(registrations[0]?.registrantName ?? "");
  const [locationId, setLocationId] = useState(registrations[0]?.locationId ?? locations[0]?.id ?? "");
  const [hasIdentifiers, setHasIdentifiers] = useState(true);

  const [amendsRecordId, setAmendsRecordId] = useState("");
  const [amendmentReason, setAmendmentReason] = useState("");

  // Murray and Lehi file into different libraries, so the folder is remembered
  // per clinic. Changing the clinic swaps the folder rather than keeping the
  // last one — otherwise the second clinic quietly files into the first's inbox.
  const [folder, setFolder] = useState<DriveItemRef | null>(() => rememberedFolder(registrations[0]?.id));
  const [folderUrl, setFolderUrl] = useState(() => rememberedFolder(registrations[0]?.id)?.webUrl ?? "");
  const [resolving, setResolving] = useState(false);

  /**
   * Each registration files to its own folder — a site can hold more than one
   * over time (an individual number, then a location number), and their
   * records must not mix.
   *
   * Choosing a registration suggests its own address as the place of use, but
   * does not force it. There was a period when meds ordered under one site's
   * number were used at another, before it was widely understood that a DEA
   * registration is tied to an address. Those records exist and have to be
   * filable as what they actually were.
   */
  function chooseRegistration(id: string) {
    setRegistrationId(id);
    const reg = registrations.find((r) => r.id === id);
    if (reg) {
      setLocationId(reg.locationId);
      // A sensible default, not an assumption: with an individual registration
      // the registrant usually is the directing clinician, but with a location
      // registration the registrant is the practice and this must be a person.
      if (reg.registrantType === "individual") setDirectedByName(reg.registrantName);
    }
    const remembered = rememberedFolder(id);
    setFolder(remembered);
    setFolderUrl(remembered?.webUrl ?? "");
  }

  const engine = ocrEngine();
  const identifierCount = useMemo(() => rows.reduce((n, r) => n + r.identifiers.length, 0), [rows]);
  // Quantity problems are caught HERE, at review, not at reconciliation — an
  // order-of-magnitude slip is cheap to fix while the page is still in front
  // of you and expensive once it is the record.
  const quantityWarnings = useMemo(() => checkQuantities(rows.map((r) => r.entry)), [rows]);
  const preview = useMemo(
    () => reconcile(rows.map((r) => r.entry), { opening: numOrNull(opening), closing: numOrNull(closing) }),
    [rows, opening, closing],
  );

  /* ------------------------------------------------------ reading pages */

  async function readPages(chosen: File[]) {
    if (!localOcrAvailable()) {
      toast.error("This device can't read pages on its own, and these pages mustn't be uploaded to be read.");
      return;
    }
    setFiles((p) => [...p, ...chosen]);
    try {
      for (const [i, file] of chosen.entries()) {
        setReading(`Reading ${file.name} (${i + 1} of ${chosen.length})…`);
        const lines = await readPageLocally(await fileToBase64(file));
        const text = rowsToText(lines);
        const parsed = parsePage(text.split("\n"), {
          unit,
          defaultYear: periodStart ? Number(periodStart.slice(0, 4)) : undefined,
        });
        // Remember which page each row came from, so a discrepancy can be
        // traced back to the sheet it was read off.
        setRows((p) => [...p, ...parsed.map((r) => ({ ...r, entry: { ...r.entry, pageRef: file.name } }))]);
      }
      toast.success("Pages read — check every row before saving.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't read that page.");
    } finally {
      setReading(null);
      void releaseOcr();
    }
  }

  function editRow(i: number, patch: Partial<CsArchiveEntry>) {
    setRows((p) => p.map((r, n) => (n === i ? { ...r, entry: { ...r.entry, ...patch }, flags: [] } : r)));
  }

  /* --------------------------------------------------- the folder */

  async function resolveFolder() {
    if (!folderUrl.trim()) return;
    setResolving(true);
    try {
      const ref = await msResolveUrl(folderUrl);
      if (!ref.isFolder) throw new Error("That link points at a file — paste the address of the folder the logs go in.");
      setFolder(ref);
      rememberFolder(ref, registrationId);
      toast.success(`Filing to ${ref.name}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't open that folder.");
      setFolder(null);
    } finally {
      setResolving(false);
    }
  }

  /* ------------------------------------------------------------- saving */

  const label = [substanceName || "Controlled substance", LOG_TYPES.find((t) => t.value === recordType)?.label.toLowerCase(), periodStart && periodEnd ? `${periodStart} to ${periodEnd}` : recordDate].filter(Boolean).join(" · ");

  async function save() {
    if (!registrationId) { toast.error("Choose the DEA registration this log was kept under — records are kept per registration."); return; }
    // An amendment with no stated reason is a worse record than the one it
    // corrects. Years later — at a DEA inspection, say — "why was this
    // changed?" is the whole question, and nobody will remember.
    if (amendsRecordId && !amendmentReason.trim()) { toast.error("Say why this log is being corrected — it goes on the record."); return; }
    if (!folder) { toast.error("Choose the SharePoint folder for this clinic first."); return; }
    if (rows.length === 0) { toast.error("No entries were read off these pages."); return; }

    const audit = { movement: "upload" as const, label, location: folder.name, identified: hasIdentifiers, pages: files.length };
    auditLogMovement({ ...audit, outcome: "attempted" });
    setSaving(true);
    try {
      // The pages themselves are the DEA record; the CSV is the index into
      // them. Both go to SharePoint, neither goes to the Hub.
      // An amendment joins its parent's folder; an original starts one. The
      // destination rides in the filename, because the flow that files these
      // away can't ask the Hub where they belong (see archive-names.ts).
      const parent = amendsRecordId ? amendable.find((r) => r.id === amendsRecordId) : undefined;
      const archiveKey = parent?.archiveKey || newArchiveKey();
      const destination = parent?.folderLabel || folderLabel({
        locationName: registrations.find((r) => r.id === registrationId)?.label,
        substanceName,
        recordTypeLabel: LOG_TYPES.find((t) => t.value === recordType)?.label ?? "Log",
        periodStart, periodEnd, recordDate,
      });

      // Hashed here, before the bytes leave, so what the Hub records and what
      // SharePoint holds can be compared later from outside SharePoint.
      const fileHashes: Record<string, string> = {};
      const prefix = amendsRecordId ? "amendment-" : "";

      for (const file of files) {
        const name = inboxFileName(archiveKey, destination, `${prefix}${file.name}`);
        fileHashes[name] = await hashFile(file);
        await msUpload(folder, name, file);
      }
      const csv = new Blob([fullRecordCsv(rows, label)], { type: "text/csv" });
      const csvName = inboxFileName(archiveKey, destination, `${prefix}entries.csv`);
      fileHashes[csvName] = await hashFile(csv);
      const index = await msUpload(folder, csvName, csv);

      auditLogMovement({ ...audit, outcome: "succeeded" });

      // Only now does anything reach the Hub, and only the de-identified half.
      await onSave({
        recordType,
        substanceName: substanceName.trim(),
        unit: unit.trim(),
        recordDate: recordDate ? dateInputToISO(recordDate) : null,
        periodStart: periodStart ? dateInputToISO(periodStart) : null,
        periodEnd: periodEnd ? dateInputToISO(periodEnd) : null,
        registrationId: registrationId || null,
        directedByName: directedByName.trim() || null,
        locationId: locationId || null,
        openingBalance: numOrNull(opening),
        closingBalance: numOrNull(closing),
        containsPatientIdentifiers: hasIdentifiers,
        archiveKey,
        fileHashes,
        amendsRecordId: amendsRecordId || null,
        amendmentReason: amendsRecordId ? amendmentReason.trim() : null,
        externalUrl: index.webUrl,
        externalSystem: "SharePoint",
        entries: hubEntries(rows),
        notes: `Filed by ${profile?.fullName ?? "unknown"} from ${files.length} ${files.length === 1 ? "page" : "pages"}, read on this device with ${engine === "vision" ? "Apple Vision" : "Tesseract"}.`,
      });
      toast.success("Log filed — full record in SharePoint, entries in the Hub");
      onClose();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Couldn't file the log.";
      auditLogMovement({ ...audit, outcome: "failed", error: message });
      toast.error(`${message} Nothing was saved to the Hub.`);
    } finally {
      setSaving(false);
    }
  }

  /* ---------------------------------------------------------------- UI */

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-xl border border-border bg-card shadow-xl">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-card px-5 py-4">
          <div>
            <h2 className="font-semibold">File a paper log</h2>
            <p className="text-xs text-muted-foreground">
              Pages are read on this device and never uploaded to the Hub. The full record goes to SharePoint; the Hub keeps the entries.
            </p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="size-4" /></button>
        </div>

        <div className="space-y-6 p-5">
          {/* what this log is */}
          <section className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Log type</label>
              <select className="input w-full" value={recordType} onChange={(e) => setRecordType(e.target.value as DeaRecordType)}>
                {LOG_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Substance</label>
              <input className="input w-full" value={substanceName} onChange={(e) => setSubstanceName(e.target.value)} placeholder="Ketamine" />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Unit</label>
              <input className="input w-full" value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="mg" />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Period start</label>
              <input type="date" className="input w-full" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Period end</label>
              <input type="date" className="input w-full" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">DEA registration</label>
              <select className="input w-full" value={registrationId} onChange={(e) => chooseRegistration(e.target.value)}>
                {registrations.length === 0 && <option value="">No registrations set up yet</option>}
                {registrations.map((r) => (
                  <option key={r.id} value={r.id}>{r.label}{r.retired ? " · retired" : ""}</option>
                ))}
              </select>
              <p className="text-[11px] text-muted-foreground">Records are kept per registration, and each files to its own folder.</p>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Under the direction of</label>
              <input className="input w-full" value={directedByName} onChange={(e) => setDirectedByName(e.target.value)} placeholder="e.g. the medical director" />
              <p className="text-[11px] text-muted-foreground">The clinician who directed these treatments — not necessarily whoever administered each dose.</p>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Where it was used</label>
              <select className="input w-full" value={locationId} onChange={(e) => setLocationId(e.target.value)}>
                <option value="">Not specified</option>
                {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
              {locationId && registrations.find((r) => r.id === registrationId)?.locationId !== locationId && (
                <p className="text-[11px] text-warning">
                  Kept under a registration for a different address. That happens — record it as it was.
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Opening balance</label>
              <input className="input w-full" inputMode="decimal" value={opening} onChange={(e) => setOpening(e.target.value)} placeholder={`e.g. 0 ${unit}`} />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Closing balance</label>
              <input className="input w-full" inputMode="decimal" value={closing} onChange={(e) => setClosing(e.target.value)} placeholder="as written on the sheet" />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Record date</label>
              <input type="date" className="input w-full" value={recordDate} onChange={(e) => setRecordDate(e.target.value)} />
            </div>
          </section>

          {/* correcting something already filed */}
          {amendable.length > 0 && (
            <section className="space-y-2 rounded-md border border-border bg-secondary/10 p-3">
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox" className="mt-1" checked={!!amendsRecordId}
                  onChange={(e) => setAmendsRecordId(e.target.checked ? (amendable[0]?.id ?? "") : "")}
                />
                <span>
                  <span className="font-medium">This corrects a log already on file</span>
                  <span className="block text-xs text-muted-foreground">
                    Filed records can&apos;t be edited or deleted — a correction is filed as a new record that supersedes the old one. Both are kept, and only this one counts towards reconciliation.
                  </span>
                </span>
              </label>
              {amendsRecordId && (
                <div className="grid gap-3 pl-6 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">Which log</label>
                    <select className="input w-full" value={amendsRecordId} onChange={(e) => setAmendsRecordId(e.target.value)}>
                      {amendable.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">Why it&apos;s being corrected <span className="text-destructive">*</span></label>
                    <input className="input w-full" value={amendmentReason} onChange={(e) => setAmendmentReason(e.target.value)} placeholder="e.g. a page was missed; amended at DEA request" />
                    <p className="text-[11px] text-muted-foreground">Kept on the record permanently. Years from now this is what answers &quot;why was this changed?&quot;</p>
                  </div>
                </div>
              )}
            </section>
          )}

          {/* the pages */}
          <section className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-medium">Pages</h3>
              <Badge variant={engine === "vision" ? "success" : "secondary"}>
                <Scan className="size-3.5" />
                {engine === "vision" ? "Reading with Apple Vision on this Mac"
                  : engine === "tesseract" ? "Reading in this browser"
                  : "This device can't read pages"}
              </Badge>
            </div>
            <label className="flex cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed border-border bg-secondary/10 px-3 py-6 text-sm text-muted-foreground hover:bg-secondary/20">
              {reading ? <Loader2 className="size-4 animate-spin text-primary" /> : <Upload className="size-4" />}
              {reading ?? "Choose the scanned or photographed pages"}
              <input
                type="file" accept="image/*" multiple className="hidden" disabled={!!reading || !localOcrAvailable()}
                onChange={(e) => { const f = Array.from(e.target.files ?? []); e.target.value = ""; if (f.length) void readPages(f); }}
              />
            </label>
            {files.length > 0 && (
              <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                <FileText className="size-3.5" />
                {files.map((f) => f.name).join(", ")}
              </p>
            )}
          </section>

          {/* what was read */}
          {rows.length > 0 && (
            <section className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-medium">{rows.length} {rows.length === 1 ? "entry" : "entries"} read — check each one</h3>
                {identifierCount > 0 && (
                  <Badge variant="warning">
                    <Lock className="size-3.5" /> {identifierCount} chart {identifierCount === 1 ? "number" : "numbers"} found — kept for SharePoint, not sent to the Hub
                  </Badge>
                )}
              </div>
              <div className="max-h-80 overflow-auto rounded-md border border-border">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-secondary/60 text-left text-xs text-muted-foreground">
                    <tr>
                      <th className="p-2 font-medium">Date</th>
                      <th className="p-2 font-medium">Vial</th>
                      <th className="p-2 font-medium">Action</th>
                      <th className="p-2 font-medium">Amount</th>
                      <th className="p-2 font-medium">Staff</th>
                      <th className="p-2 font-medium">Book</th>
                      <th className="p-2 font-medium">How known</th>
                      <th className="p-2 font-medium">Read as</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => (
                      <tr key={`${r.source}-${i}`} className={`border-t border-border/50 ${r.flags.length ? "bg-warning/5" : ""}`}>
                        <td className="p-1.5"><input type="date" className="input w-36 text-xs" value={r.entry.date ?? ""} onChange={(e) => editRow(i, { date: e.target.value || null })} /></td>
                        <td className="p-1.5"><input className="input w-24 font-mono text-xs" value={r.entry.vialLabel ?? ""} onChange={(e) => editRow(i, { vialLabel: e.target.value.toUpperCase() || null })} /></td>
                        <td className="p-1.5">
                          <select className="input w-32 text-xs" value={r.entry.action} onChange={(e) => editRow(i, { action: e.target.value as CsArchiveEntry["action"] })}>
                            {csEntryActions.map((a) => <option key={a} value={a}>{a}</option>)}
                          </select>
                        </td>
                        <td className="p-1.5"><input className="input w-20 text-xs" inputMode="decimal" value={r.entry.amount ?? ""} onChange={(e) => editRow(i, { amount: e.target.value === "" ? null : Number(e.target.value) })} /></td>
                        <td className="p-1.5"><input className="input w-24 text-xs" value={r.entry.staff ?? ""} onChange={(e) => editRow(i, { staff: e.target.value || null })} /></td>
                        <td className="p-1.5"><input className="input w-24 text-xs" value={r.entry.book ?? ""} onChange={(e) => editRow(i, { book: e.target.value || null })} placeholder="book / set" /></td>
                        <td className="p-1.5">
                          <select className="input w-28 text-xs" value={r.entry.basis ?? "transcribed"} onChange={(e) => editRow(i, { basis: e.target.value as CsArchiveEntry["basis"] })}>
                            {csEntryBases.map((b) => <option key={b} value={b}>{b}</option>)}
                          </select>
                        </td>
                        <td className="p-1.5 text-[11px] text-muted-foreground">
                          <span className="line-clamp-2">{r.source}</span>
                          {r.flags.length > 0 && <span className="block text-warning">{r.flags.join("; ")}</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {quantityWarnings.length > 0 && (
                <div className="space-y-1 rounded-md border border-warning/40 bg-warning/10 p-3 text-xs">
                  <p className="flex items-center gap-1.5 font-medium"><AlertTriangle className="size-3.5" /> Check these quantities</p>
                  <ul className="list-disc space-y-0.5 pl-5 text-muted-foreground">
                    {quantityWarnings.map(({ index, warning }) => (
                      <li key={`${index}-${warning.kind}`}><strong>Row {index + 1}</strong> — {warning.message}</li>
                    ))}
                  </ul>
                </div>
              )}

              {preview.issues.length > 0 && (
                <div className="space-y-1 rounded-md border border-warning/40 bg-warning/10 p-3 text-xs">
                  <p className="flex items-center gap-1.5 font-medium"><AlertTriangle className="size-3.5" /> Before you file this</p>
                  <ul className="list-disc space-y-0.5 pl-5 text-muted-foreground">
                    {preview.issues.map((x) => <li key={x}>{x}</li>)}
                  </ul>
                </div>
              )}
            </section>
          )}

          {/* where the full record goes */}
          <section className="space-y-2">
            <h3 className="text-sm font-medium">SharePoint folder</h3>
            {!msConfigured() ? (
              <p className="rounded-md bg-secondary/40 px-3 py-2 text-xs text-muted-foreground">
                Microsoft 365 isn&apos;t connected to the Hub yet, so the full record can&apos;t be filed from here. An administrator needs to finish that setup.
              </p>
            ) : (
              <>
                <div className="flex flex-wrap gap-2">
                  <input
                    className="input min-w-64 flex-1" value={folderUrl} onChange={(e) => setFolderUrl(e.target.value)}
                    placeholder="Paste the folder's address from SharePoint"
                  />
                  <Button variant="outline" onClick={resolveFolder} disabled={resolving || !folderUrl.trim()}>
                    {resolving ? <Loader2 className="size-4 animate-spin" /> : <FolderOpen className="size-4" />}
                    {resolving ? "Checking…" : "Use this folder"}
                  </Button>
                </div>
                {folder && (
                  <p className="flex items-center gap-1.5 text-xs text-success"><Check className="size-3.5" /> Filing to {folder.name}</p>
                )}
                <label className="flex items-start gap-2 pt-1 text-xs text-muted-foreground">
                  <input type="checkbox" className="mt-0.5" checked={hasIdentifiers} onChange={(e) => setHasIdentifiers(e.target.checked)} />
                  <span>
                    These pages identify patients (chart, Jane, Luminello or Athena numbers).
                    Leave this ticked unless you have checked every page — it is what keeps the record out of the Hub&apos;s own storage.
                  </span>
                </label>
              </>
            )}
          </section>
        </div>

        <div className="sticky bottom-0 flex flex-wrap items-center justify-between gap-2 border-t border-border bg-card px-5 py-3">
          <p className="text-xs text-muted-foreground">
            {folder && rows.length > 0
              ? `${files.length} ${files.length === 1 ? "page" : "pages"} and ${rows.length} ${rows.length === 1 ? "entry" : "entries"} to ${folder.name}`
              : "Read the pages and choose a folder to file this log."}
          </p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
            <Button onClick={save} disabled={saving || !folder || rows.length === 0 || !!reading}>
              {saving ? "Filing…" : "File log"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
