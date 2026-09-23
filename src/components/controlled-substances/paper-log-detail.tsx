"use client";

/**
 * A filed paper log, opened back up.
 *
 * What the Hub can show everyone is the de-identified half: the entries, the
 * vial-by-vial balance and the period totals. That is enough to reconcile a
 * log, and it carries no patient identifier, so it is not PHI.
 *
 * The other half — the page with the chart numbers on it — lives in SharePoint
 * under the practice's Microsoft agreement. It is fetched straight from
 * Microsoft by the person asking, so SharePoint's own permissions decide
 * whether they get it; the Hub's permission only decides whether to offer.
 * Both gates have to agree, and neither can be talked round by the other.
 *
 * Every fetch is written to the audit log before it starts, naming the Hub user
 * and the Microsoft account used. "We can't tell who opened it" is not an
 * answer anyone wants to give an inspector.
 */

import { useMemo, useState } from "react";
import { Download, ExternalLink, FileWarning, Lock, ShieldCheck, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth/context";
import { hasPermission } from "@/lib/auth/roles";
import { logAccess } from "@/lib/audit-client";
import { formatDate } from "@/lib/dates";
import { reconcile } from "@/lib/cs-archive/reconcile";
import { msAccount, msConfigured, msDownload, saveBlob } from "@/lib/ms-graph";
import type { DeaRecord } from "@/lib/data/schema";
import { toast } from "sonner";

const num = (n: number | null | undefined, unit?: string | null) =>
  typeof n === "number" ? `${n}${unit ? ` ${unit}` : ""}` : "—";

export function PaperLogDetail({ record }: { record: DeaRecord }) {
  const { profile } = useAuth();
  const [fetching, setFetching] = useState(false);

  const entries = useMemo(() => record.entries ?? [], [record.entries]);
  const result = useMemo(
    () => reconcile(entries, { opening: record.openingBalance, closing: record.closingBalance }),
    [entries, record.openingBalance, record.closingBalance],
  );

  const mayOpen = hasPermission(profile?.accountRole, "canOpenIdentifiedLogs");
  const external = record.externalUrl?.trim();

  async function download() {
    if (!external) return;
    // Logged BEFORE the fetch: an attempt that fails at SharePoint is still an
    // attempt, and that is exactly the kind of thing an audit wants to see.
    logAccess({
      action: "export",
      entityType: "dea_record",
      entityId: record.id,
      entityLabel: `${record.substanceName ?? "Controlled substance"} log${record.recordDate ? ` — ${formatDate(record.recordDate)}` : ""}`,
      details: `Fetched the identified record from ${record.externalSystem ?? "SharePoint"}${msAccount() ? ` as ${msAccount()}` : ""}`,
      riskLevel: "high",
    });
    setFetching(true);
    try {
      const { blob, name } = await msDownload(external);
      saveBlob(blob, name);
      toast.success("Record downloaded from SharePoint");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't fetch the record.");
    } finally {
      setFetching(false);
    }
  }

  return (
    <div className="space-y-4 rounded-lg border border-border bg-secondary/10 p-4">
      {/* Where the identified record is, and who may go and get it. */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="text-sm font-medium">
            {record.substanceName ?? "Controlled substance"} log
            {record.periodStart && record.periodEnd && (
              <span className="text-muted-foreground"> · {formatDate(record.periodStart)}–{formatDate(record.periodEnd)}</span>
            )}
          </p>
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            {record.containsPatientIdentifiers ? (
              <><Lock className="size-3.5" /> Full record held in {record.externalSystem ?? "SharePoint"} — the Hub keeps only the entries below</>
            ) : (
              <><ShieldCheck className="size-3.5" /> No patient identifiers on this log</>
            )}
          </p>
        </div>

        {external && (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" asChild>
              <a href={external} target="_blank" rel="noopener noreferrer"><ExternalLink className="size-4" /> Open in SharePoint</a>
            </Button>
            {mayOpen ? (
              <Button size="sm" onClick={download} disabled={fetching || !msConfigured()}>
                <Download className="size-4" /> {fetching ? "Fetching…" : "Download record"}
              </Button>
            ) : (
              <span className="flex items-center gap-1.5 rounded-md bg-secondary/60 px-2.5 py-1.5 text-xs text-muted-foreground">
                <Lock className="size-3.5" /> You don&apos;t have permission to open the identified record
              </span>
            )}
          </div>
        )}
      </div>

      {/* The period, as written on the sheet against what the entries add up to. */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {([
          ["Opening", num(result.period.opening, record.unit)],
          ["Received", num(result.period.received, record.unit)],
          ["Administered", num(result.period.administered, record.unit)],
          ["Wasted", num(result.period.wasted, record.unit)],
          ["Closing", num(result.period.statedClosing, record.unit)],
        ] as const).map(([label, value]) => (
          <div key={label} className="rounded-md border border-border bg-card px-3 py-2">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
            <p className="text-sm font-medium tabular-nums">{value}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        {result.period.difference === null ? (
          <Badge variant="secondary">Period can&apos;t be balanced — no opening or closing figure</Badge>
        ) : result.period.balances ? (
          <Badge variant="success"><ShieldCheck className="size-3.5" /> Period balances</Badge>
        ) : (
          <Badge variant="warning">
            <TriangleAlert className="size-3.5" /> Off by {result.period.difference > 0 ? "+" : ""}{result.period.difference}{record.unit ? ` ${record.unit}` : ""}
          </Badge>
        )}
        {record.reconciled && (
          <Badge variant="success">Reconciled{record.reconciledByName ? ` by ${record.reconciledByName}` : ""}{record.reconciledAt ? ` · ${formatDate(record.reconciledAt)}` : ""}</Badge>
        )}
      </div>

      {result.issues.length > 0 && (
        <div className="space-y-1 rounded-md border border-warning/40 bg-warning/10 p-3">
          <p className="flex items-center gap-1.5 text-sm font-medium"><FileWarning className="size-4" /> Worth a second look</p>
          <ul className="list-disc space-y-0.5 pl-5 text-xs text-muted-foreground">
            {result.issues.map((i) => <li key={i}>{i}</li>)}
          </ul>
          <p className="pt-1 text-[11px] text-muted-foreground">
            A difference is not automatically a discrepancy — a rounding convention or a partial vial can explain one. Check against the page before recording it as a loss.
          </p>
        </div>
      )}

      {/* Vial by vial. */}
      {result.vials.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm rtable">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th className="pb-2 pr-4 font-medium">Vial</th>
                <th className="pb-2 pr-4 font-medium">Received</th>
                <th className="pb-2 pr-4 font-medium">Administered</th>
                <th className="pb-2 pr-4 font-medium">Wasted</th>
                <th className="pb-2 pr-4 font-medium">Unaccounted</th>
                <th className="pb-2 font-medium">Entries</th>
              </tr>
            </thead>
            <tbody>
              {result.vials.map((v) => (
                <tr key={v.vialLabel} className="border-b border-border/50">
                  <td data-label="Vial" className="py-2 pr-4 font-mono font-medium">{v.vialLabel}</td>
                  <td data-label="Received" className="py-2 pr-4 tabular-nums text-muted-foreground">{num(v.received, record.unit)}</td>
                  <td data-label="Administered" className="py-2 pr-4 tabular-nums text-muted-foreground">{num(v.administered, record.unit)}</td>
                  <td data-label="Wasted" className="py-2 pr-4 tabular-nums text-muted-foreground">{num(v.wasted, record.unit)}</td>
                  <td data-label="Unaccounted" className="py-2 pr-4 tabular-nums">
                    <span className={v.issues.length ? "font-medium text-warning" : "text-muted-foreground"}>{num(v.remaining, record.unit)}</span>
                  </td>
                  <td data-label="Entries" className="py-2 text-muted-foreground">
                    {v.entryCount}
                    {v.firstDate && <span className="block text-[11px]">{formatDate(v.firstDate)}{v.lastDate && v.lastDate !== v.firstDate ? `–${formatDate(v.lastDate)}` : ""}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {entries.length === 0 && (
        <p className="py-4 text-center text-sm text-muted-foreground">
          No entries were read off this log yet — only the record and its link are stored.
        </p>
      )}
    </div>
  );
}
