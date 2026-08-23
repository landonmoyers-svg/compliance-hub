"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Loader2, Trash2 } from "lucide-react";
import { Card } from "@/components/ui";
import { useVault } from "@/lib/vault/provider";
import { CATEGORIES, CATEGORY_BY_KEY, type CategoryKey } from "@/lib/domain/categories";
import type { RecordField, RecordKind, RecordPayload } from "@/lib/domain/records";
import { seal } from "@/lib/crypto/envelope";
import { utf8ToBytes } from "@/lib/crypto/encoding";
import { createRecordAction } from "./actions";

/**
 * Add a record.
 *
 * The whole point of this component is where the encryption happens: the
 * payload is sealed **here**, in the browser, under the live vault key. The
 * Server Action that follows receives ciphertext and non-secret metadata only.
 */

const inputClass =
  "w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-accent/50";

/** Blank row for the field editor. */
const emptyField = (): RecordField => ({ key: "", value: "", secret: true });

export function AddRecord() {
  const router = useRouter();
  const { requireVaultKey, snapshot } = useVault();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [category, setCategory] = useState<CategoryKey>("identity");
  const [label, setLabel] = useState("");
  const [kind, setKind] = useState<RecordKind>("digital");
  const [expiresOn, setExpiresOn] = useState("");
  const [physicalLocation, setPhysicalLocation] = useState("");
  const [notes, setNotes] = useState("");
  const [fields, setFields] = useState<RecordField[]>([emptyField()]);

  // The category carries the default sensitivity, so the tier is not another
  // decision the user has to get right.
  const tier = CATEGORY_BY_KEY[category].tier;

  if (snapshot.state !== "unlocked") return null;

  function reset() {
    setLabel("");
    setExpiresOn("");
    setPhysicalLocation("");
    setNotes("");
    setFields([emptyField()]);
    setError(null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const payload: RecordPayload = {
        fields: fields.filter((f) => f.key.trim() || f.value.trim()),
        ...(physicalLocation.trim() ? { physicalLocation: physicalLocation.trim() } : {}),
        ...(notes.trim() ? { notes: notes.trim() } : {}),
      };

      const meta = {
        category,
        tier,
        label: label.trim(),
        kind,
        hasPhysicalLocation: Boolean(physicalLocation.trim()),
        expiresOn: expiresOn || null,
      };

      // Bind the non-secret metadata into the GCM tag, so the server cannot
      // move this ciphertext under a different label or category undetected.
      // The record id isn't known yet, so it is deliberately not part of the
      // AAD — see aadForStored() in demo-payloads.ts for the read side.
      const aad = utf8ToBytes(JSON.stringify({ category: meta.category, tier: meta.tier, label: meta.label }));
      const sealed = await seal(payload, requireVaultKey(), aad);

      await createRecordAction({ ...meta, sealed });
      reset();
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the record.");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="mb-4 inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white"
      >
        <Plus size={15} /> Add a record
      </button>
    );
  }

  return (
    <Card className="mb-5 p-5">
      <h2 className="font-semibold">Add a record</h2>
      <p className="mt-1 text-xs text-muted">
        Everything except the label, category and dates is encrypted on this device before it is saved.
      </p>

      <form onSubmit={submit} className="mt-4 flex flex-col gap-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted">Label (not encrypted)</span>
            <input value={label} onChange={(e) => setLabel(e.target.value)} required maxLength={120}
              placeholder="Homeowners policy" className={inputClass} />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted">Category</span>
            <select value={category} onChange={(e) => setCategory(e.target.value as CategoryKey)} className={inputClass}>
              {CATEGORIES.map((c) => (
                <option key={c.key} value={c.key}>{c.label}</option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted">Kind</span>
            <select value={kind} onChange={(e) => setKind(e.target.value as RecordKind)} className={inputClass}>
              <option value="digital">Digital only</option>
              <option value="physical">Physical original</option>
              <option value="both">Both</option>
            </select>
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted">Expires (optional, not encrypted)</span>
            <input type="date" value={expiresOn} onChange={(e) => setExpiresOn(e.target.value)} className={inputClass} />
          </label>
        </div>

        <div className="rounded-lg border border-border bg-surface-2 p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-medium">Details (encrypted)</span>
            <span className="text-xs text-muted">tier: {tier}</span>
          </div>
          <div className="flex flex-col gap-2">
            {fields.map((f, i) => (
              <div key={i} className="flex gap-2">
                <input value={f.key} placeholder="Account number" className={inputClass}
                  onChange={(e) => setFields(fields.map((x, j) => (j === i ? { ...x, key: e.target.value } : x)))} />
                <input value={f.value} placeholder="Value" className={inputClass}
                  onChange={(e) => setFields(fields.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))} />
                <button type="button" title="Remove this field"
                  onClick={() => setFields(fields.length > 1 ? fields.filter((_, j) => j !== i) : [emptyField()])}
                  className="rounded-lg border border-border px-2 text-muted hover:text-danger">
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
          <button type="button" onClick={() => setFields([...fields, emptyField()])}
            className="mt-2 text-xs text-accent hover:underline">
            + another field
          </button>
        </div>

        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted">Where the original lives (encrypted, optional)</span>
          <input value={physicalLocation} onChange={(e) => setPhysicalLocation(e.target.value)}
            placeholder="Fire safe, upstairs closet" className={inputClass} />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted">Notes (encrypted, optional)</span>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={inputClass} />
        </label>

        {error ? <p className="text-sm text-danger">{error}</p> : null}

        <div className="flex items-center gap-2">
          <button type="submit" disabled={busy}
            className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-60">
            {busy ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
            {busy ? "Encrypting and saving…" : "Save record"}
          </button>
          <button type="button" onClick={() => { setOpen(false); reset(); }}
            className="rounded-lg border border-border px-4 py-2 text-sm text-muted hover:text-foreground">
            Cancel
          </button>
        </div>
      </form>
    </Card>
  );
}
