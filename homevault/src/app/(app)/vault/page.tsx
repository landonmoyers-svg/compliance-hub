"use client";

import { useMemo, useState } from "react";
import { FolderLock, Lock, MapPin, Search, FileText, Fingerprint } from "lucide-react";
import { Card, PageHeader, Badge, TierBadge } from "@/components/ui";
import { CATEGORIES, CATEGORY_BY_KEY, requiresStepUp, type CategoryKey } from "@/lib/domain/categories";
import { expiryStatus, type RecordMeta } from "@/lib/domain/records";
import { DEMO_RECORDS } from "@/lib/data/demo";
import { cn } from "@/lib/cn";

const EXPIRY_TONE = { expired: "danger", soon: "warning", ok: "success", none: "neutral" } as const;

export default function VaultPage() {
  const [active, setActive] = useState<CategoryKey | "all">("all");
  const [query, setQuery] = useState("");
  const [revealed, setRevealed] = useState<string | null>(null);

  const records = useMemo(() => {
    return DEMO_RECORDS.filter((r) => (active === "all" ? true : r.category === active)).filter((r) =>
      query ? r.label.toLowerCase().includes(query.toLowerCase()) : true,
    );
  }, [active, query]);

  return (
    <div>
      <PageHeader
        icon={<FolderLock size={22} />}
        title="Vault"
        subtitle="Digital backups and physical-location references — encrypted on your device before they're stored."
      />

      <div className="mb-4 flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2">
        <Search size={16} className="text-muted" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search labels (metadata only — search never decrypts)…"
          className="w-full bg-transparent text-sm outline-none placeholder:text-muted"
        />
      </div>

      <div className="mb-5 flex flex-wrap gap-2">
        <CategoryChip label="All" activeChip={active === "all"} onClick={() => setActive("all")} />
        {CATEGORIES.map((c) => (
          <CategoryChip
            key={c.key}
            label={c.label}
            activeChip={active === c.key}
            onClick={() => setActive(c.key)}
          />
        ))}
      </div>

      <div className="grid gap-3">
        {records.map((r) => (
          <RecordRow
            key={r.id}
            record={r}
            revealed={revealed === r.id}
            onToggle={() => setRevealed((cur) => (cur === r.id ? null : r.id))}
          />
        ))}
        {records.length === 0 ? (
          <Card className="p-8 text-center text-sm text-muted">No records match. Try a different category.</Card>
        ) : null}
      </div>
    </div>
  );
}

function CategoryChip({ label, activeChip, onClick }: { label: string; activeChip: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
        activeChip ? "border-accent/40 bg-accent/15 text-accent" : "border-border bg-surface text-muted hover:text-foreground",
      )}
    >
      {label}
    </button>
  );
}

function RecordRow({
  record,
  revealed,
  onToggle,
}: {
  record: RecordMeta;
  revealed: boolean;
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
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-xs font-medium hover:bg-surface"
          >
            {stepUp ? <Fingerprint size={13} /> : <Lock size={13} />}
            {revealed ? "Hide" : stepUp ? "Reveal (step-up)" : "Reveal"}
          </button>
        </div>
      </div>

      {revealed ? (
        <div className="mt-3 rounded-lg border border-dashed border-accent/30 bg-surface-2 p-3 text-xs text-muted">
          {stepUp ? (
            <p>
              <span className="font-medium text-warning">Step-up required.</span> In production, revealing a{" "}
              <b>critical</b>-tier record mints a one-time capability token after a fresh passkey tap, and the
              access is written to the tamper-evident log. The payload is then decrypted <b>in your browser</b>{" "}
              with this record&apos;s data key — the server never sees plaintext.
            </p>
          ) : (
            <p>
              The encrypted payload would decrypt <b>in your browser</b> here. In demo mode no real secret is
              stored; this pane illustrates the zero-knowledge reveal flow.
            </p>
          )}
        </div>
      ) : null}
    </Card>
  );
}
