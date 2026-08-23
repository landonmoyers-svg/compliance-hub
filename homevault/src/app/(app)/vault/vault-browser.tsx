"use client";

import { useMemo, useState } from "react";
import { FolderLock, Lock, MapPin, Search, FileText, Fingerprint } from "lucide-react";
import { Card, PageHeader, Badge, TierBadge } from "@/components/ui";
import { SideNav } from "@/components/side-nav";
import { CATEGORIES, CATEGORY_BY_KEY, requiresStepUp, type CategoryKey } from "@/lib/domain/categories";
import { expiryStatus, type RecordMeta, type RecordPayload } from "@/lib/domain/records";
import { useVault } from "@/lib/vault/provider";
import { VaultUnlockPanel } from "@/components/vault-lock";
import { sealDemoRecord, openDemoRecord, aadForStored } from "@/lib/vault/demo-payloads";
import { open as openSealed } from "@/lib/crypto/envelope";
import { getSealedRecordAction } from "./actions";
import { AddRecord } from "./add-record";
import type { RecordPayload as Payload } from "@/lib/domain/records";
import type { SealedBytes } from "@/lib/crypto/envelope";
import { cn } from "@/lib/cn";

const EXPIRY_TONE = { expired: "danger", soon: "warning", ok: "success", none: "neutral" } as const;

/** What a reveal produced: the sealed form the server holds, and the opened plaintext. */
interface RevealResult {
  sealed: SealedBytes;
  payload: RecordPayload;
}

/**
 * The interactive vault browser. Records are fetched through the data seam by
 * the server component in `page.tsx` and passed in — filtering and the list
 * itself operate purely on non-secret metadata.
 *
 * Revealing a record runs the real envelope round-trip against the live vault
 * key: seal the payload, then reopen it. Nothing decrypts while locked.
 */
export function VaultBrowser({
  allRecords,
  live,
}: {
  allRecords: RecordMeta[];
  /** True when records come from a real household rather than the demo fixture. */
  live: boolean;
}) {
  const [active, setActive] = useState<CategoryKey | "all">("all");
  const [query, setQuery] = useState("");
  const [revealed, setRevealed] = useState<string | null>(null);
  const [result, setResult] = useState<RevealResult | null>(null);
  const [revealError, setRevealError] = useState<string | null>(null);

  const { snapshot, requireVaultKey } = useVault();
  const unlocked = snapshot.state === "unlocked";

  // Locking must take the plaintext off the screen too, not just drop the key.
  // Without this, a revealed record stays rendered after an idle auto-lock —
  // exactly the situation the lock exists to prevent (SECURITY.md § 1).
  //
  // Adjusted during render rather than in an effect: an effect would leave the
  // plaintext painted for a frame after the vault locked, which is precisely
  // the window that must not exist.
  const [wasUnlocked, setWasUnlocked] = useState(unlocked);
  if (wasUnlocked !== unlocked) {
    setWasUnlocked(unlocked);
    if (!unlocked) {
      setRevealed(null);
      setResult(null);
      setRevealError(null);
    }
  }

  const records = useMemo(() => {
    return allRecords.filter((r) => (active === "all" ? true : r.category === active)).filter((r) =>
      query ? r.label.toLowerCase().includes(query.toLowerCase()) : true,
    );
  }, [allRecords, active, query]);

  async function toggleReveal(record: RecordMeta) {
    if (revealed === record.id) {
      setRevealed(null);
      setResult(null); // drop the plaintext as soon as it's hidden
      return;
    }
    setRevealError(null);
    setResult(null);
    setRevealed(record.id);
    try {
      const vaultKey = requireVaultKey();

      if (live) {
        // A real record: fetch the stored ciphertext and open it here.
        const sealed = await getSealedRecordAction(record.id);
        if (!sealed) throw new Error("This record has no stored payload.");
        const payload = await openSealed<Payload>(sealed, vaultKey, aadForStored(record));
        setResult({ sealed, payload });
      } else {
        // Demo: seal a sample payload and reopen it, to show the real round-trip.
        const sealed = await sealDemoRecord(record, vaultKey);
        const payload = await openDemoRecord(sealed, record, vaultKey);
        setResult({ sealed, payload });
      }
    } catch (err) {
      setRevealError(err instanceof Error ? err.message : "Could not open this record.");
    }
  }

  // Counts sit in the rail, as they do on Jane's Billing nav — the number is
  // what tells you whether a category is worth opening.
  const countFor = (key: CategoryKey) => allRecords.filter((r) => r.category === key).length;

  return (
    <div>
      <PageHeader
        icon={<FolderLock size={22} />}
        title="Vault"
        subtitle="Digital backups and physical-location references — encrypted on your device before they're stored."
      />

      {/* Jane's two-column shape: categories in the rail, content on the right.
          The old chip row worked at eleven categories and would not have at
          thirty. */}
      <div className="flex gap-6">
        <SideNav
          activeKey={active}
          groups={[
            { items: [{ key: "all", label: "All records", badge: allRecords.length, onSelect: () => setActive("all") }] },
            {
              heading: "Categories",
              items: CATEGORIES.map((c) => ({
                key: c.key,
                label: c.label,
                badge: countFor(c.key),
                onSelect: () => setActive(c.key),
              })),
            },
          ]}
        />

        <div className="min-w-0 flex-1">
          <div className="mb-4 flex items-center gap-2 rounded-md border border-border bg-surface px-3 py-2.5">
            <Search size={16} className="text-muted" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search labels (metadata only — search never decrypts)…"
              className="w-full bg-transparent text-sm outline-none placeholder:text-muted"
            />
          </div>

      {!unlocked ? (
        <div className="mb-5">
          <VaultUnlockPanel />
        </div>
      ) : live ? (
        <AddRecord />
      ) : null}

      <div className="grid gap-3">
        {records.map((r) => (
          <RecordRow
            key={r.id}
            record={r}
            revealed={revealed === r.id}
            unlocked={unlocked}
            result={revealed === r.id ? result : null}
            error={revealed === r.id ? revealError : null}
            onToggle={() => toggleReveal(r)}
          />
        ))}
          {records.length === 0 ? (
            <Card className="p-8 text-center text-sm text-muted">No records match. Try a different category.</Card>
          ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function RecordRow({
  record,
  revealed,
  unlocked,
  result,
  error,
  onToggle,
}: {
  record: RecordMeta;
  revealed: boolean;
  unlocked: boolean;
  result: RevealResult | null;
  error: string | null;
  onToggle: () => void;
}) {
  const cat = CATEGORY_BY_KEY[record.category];
  const status = expiryStatus(record);
  const stepUp = requiresStepUp(record.tier);
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <cat.icon size={18} className="mt-0.5 text-accent" />
          <div>
            <div className="flex items-center gap-2">
              <span className="font-medium">{record.label}</span>
              <TierBadge tier={record.tier} />
              {record.hasPhysicalLocation ? (
                <Badge tone="neutral">
                  <MapPin size={11} /> location
                </Badge>
              ) : null}
              {record.kind !== "physical" ? (
                <Badge tone="neutral">
                  <FileText size={11} /> digital
                </Badge>
              ) : null}
            </div>
            <div className="mt-1 text-xs text-muted">
              {cat.label}
              {record.expiresOn ? ` · expires ${record.expiresOn}` : ""}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {status !== "none" ? <Badge tone={EXPIRY_TONE[status]}>{status}</Badge> : null}
          <button
            onClick={onToggle}
            disabled={!unlocked}
            title={unlocked ? undefined : "Unlock the vault to decrypt this record"}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-xs font-medium hover:bg-surface disabled:cursor-not-allowed disabled:opacity-50"
          >
            {stepUp ? <Fingerprint size={13} /> : <Lock size={13} />}
            {revealed ? "Hide" : stepUp ? "Reveal (step-up)" : "Reveal"}
          </button>
        </div>
      </div>

      {revealed ? (
        <div className="mt-3 rounded-lg border border-dashed border-accent/30 bg-surface-2 p-3 text-xs">
          {error ? (
            <p className="text-danger">{error}</p>
          ) : !result ? (
            <p className="text-muted">Decrypting…</p>
          ) : (
            <>
              <div className="mb-2 flex items-center gap-2">
                <Badge tone="success">decrypted in your browser</Badge>
                {stepUp ? (
                  <Badge tone="warning">
                    <Fingerprint size={11} /> step-up tier
                  </Badge>
                ) : null}
              </div>

              <dl className="grid gap-1">
                {result.payload.fields.map((f) => (
                  <div key={f.key} className="flex flex-wrap items-baseline gap-2">
                    <dt className="text-muted">{f.key}:</dt>
                    <dd className={cn("font-mono", f.secret ? "text-warning" : "text-foreground")}>{f.value}</dd>
                  </div>
                ))}
                {result.payload.physicalLocation ? (
                  <div className="flex flex-wrap items-baseline gap-2">
                    <dt className="text-muted">Where it lives:</dt>
                    <dd className="text-foreground">{result.payload.physicalLocation}</dd>
                  </div>
                ) : null}
                {result.payload.notes ? (
                  <div className="flex flex-wrap items-baseline gap-2">
                    <dt className="text-muted">Notes:</dt>
                    <dd className="text-foreground">{result.payload.notes}</dd>
                  </div>
                ) : null}
              </dl>

              <details className="mt-3 border-t border-border pt-2">
                <summary className="cursor-pointer text-muted hover:text-foreground">
                  What the server actually stores
                </summary>
                <p className="mt-2 text-muted">
                  This is the whole record as the server sees it — ciphertext plus a data key wrapped under
                  your vault key. Without your passphrase <i>and</i> this device, it decrypts to nothing.
                </p>
                <pre className="mt-2 overflow-x-auto rounded bg-surface p-2 font-mono text-[11px] leading-relaxed text-muted">
                  {`ciphertext:      ${truncate(result.sealed.ciphertext)}
iv:              ${result.sealed.iv}
wrappedDataKey:  ${truncate(result.sealed.wrappedDataKey)}`}
                </pre>
              </details>

              {stepUp ? (
                <p className="mt-2 text-muted">
                  In production this <b>critical</b>-tier reveal also mints a one-time capability token after a
                  fresh passkey tap, and writes the access to the tamper-evident log.
                </p>
              ) : null}
            </>
          )}
        </div>
      ) : null}
    </Card>
  );
}

function truncate(b64: string, head = 28): string {
  return b64.length <= head ? b64 : `${b64.slice(0, head)}… (${b64.length} chars)`;
}
