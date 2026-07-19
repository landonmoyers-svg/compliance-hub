"use client";

import { CheckCircle2, AlertTriangle, XCircle, ClipboardCheck } from "lucide-react";
import type { CredentialRecord, InsurancePolicyRecord } from "@/lib/data/schema";
import { PROVIDER_TYPE_LABEL, summarizeRequirements, type ProviderType, type ReqStatus } from "@/lib/credential-requirements";
import { Badge } from "@/components/ui/badge";

const ICON: Record<ReqStatus, typeof CheckCircle2> = { met: CheckCircle2, expired: AlertTriangle, missing: XCircle };
const TONE: Record<ReqStatus, string> = { met: "text-success", expired: "text-warning", missing: "text-destructive" };
const STATUS_LABEL: Record<ReqStatus, string> = { met: "Current", expired: "Expired", missing: "Missing" };

/**
 * Role-based "what must you have current" checklist. Given a person's clinical
 * role and their actual credentials + malpractice, shows each required document
 * as current / expired / missing. Used on My Portal (self) and the admin person
 * view; nothing renders for non-clinical roles.
 */
export function RequirementsChecklist({ providerType, creds, insurance }: {
  providerType: ProviderType;
  creds: CredentialRecord[];
  insurance: InsurancePolicyRecord[];
}) {
  if (providerType === "none") return null;
  const summary = summarizeRequirements(providerType, creds, insurance);
  if (summary.total === 0) return null;
  const allMet = summary.gaps.length === 0;

  return (
    <div className="rounded-lg border border-border">
      <div className="flex items-center justify-between border-b border-border bg-secondary/30 px-3 py-2">
        <div className="flex items-center gap-2">
          <ClipboardCheck className="size-4 text-muted-foreground" />
          <span className="text-sm font-medium">Required credentials</span>
          <span className="text-xs text-muted-foreground">{PROVIDER_TYPE_LABEL[providerType]}</span>
        </div>
        <Badge variant={allMet ? "success" : "warning"}>
          {allMet ? "All current" : `${summary.met}/${summary.total} current`}
        </Badge>
      </div>
      <ul className="divide-y divide-border/50">
        {summary.results.map((r) => {
          const Icon = ICON[r.status];
          return (
            <li key={r.key} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
              <span className="flex items-center gap-2">
                <Icon className={`size-4 shrink-0 ${TONE[r.status]}`} />
                <span className={r.status === "missing" ? "text-muted-foreground" : ""}>{r.label}</span>
              </span>
              <span className="flex shrink-0 items-center gap-2">
                {r.note && <span className="hidden text-xs text-muted-foreground sm:inline">{r.note}</span>}
                <Badge variant={r.status === "met" ? "success" : r.status === "expired" ? "warning" : "destructive"}>{STATUS_LABEL[r.status]}</Badge>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
