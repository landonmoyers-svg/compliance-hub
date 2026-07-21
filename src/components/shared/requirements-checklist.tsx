"use client";

import Link from "next/link";
import { CheckCircle2, AlertTriangle, XCircle, ClipboardCheck, Plus } from "lucide-react";
import type { CredentialRecord, InsurancePolicyRecord } from "@/lib/data/schema";
import { PROVIDER_TYPE_LABEL, summarizeRequirements, type ProviderType, type ReqStatus } from "@/lib/credential-requirements";
import { Badge } from "@/components/ui/badge";

const ICON: Record<ReqStatus, typeof CheckCircle2> = { met: CheckCircle2, expired: AlertTriangle, missing: XCircle };
const TONE: Record<ReqStatus, string> = { met: "text-success", expired: "text-warning", missing: "text-destructive" };
const STATUS_LABEL: Record<ReqStatus, string> = { met: "Current", expired: "Expired", missing: "Missing" };

/** Map a requirement to the credential type + name to prefill when adding it. */
const REQ_ADD: Record<string, { type: string; name: string }> = {
  rn: { type: "license", name: "RN License" },
  aprn: { type: "license", name: "APRN License" },
  aprn_cs: { type: "license", name: "APRN Controlled-Substance License" },
  pa_license: { type: "license", name: "PA License" },
  license_or_supervision: { type: "license", name: "State License" },
  diploma: { type: "other", name: "Diploma / Degree" },
  npi: { type: "other", name: "NPI" },
  dea: { type: "dea", name: "DEA Registration" },
  cpr: { type: "cpr_bls_acls", name: "BLS / CPR" },
  board: { type: "certification", name: "Board Certification" },
  supervision: { type: "other", name: "Supervision Agreement" },
};

/** Build the deep-link that opens the pre-scoped add dialog for a gap. */
function addHref(key: string, holderName?: string, holderUserId?: string | null): string | null {
  if (key === "malpractice") return "/insurance-vault"; // insurance, not a credential
  const map = REQ_ADD[key];
  if (!map) return null;
  const q = new URLSearchParams({ add: "credential", type: map.type, name: map.name });
  if (holderName) q.set("holder", holderName);
  if (holderUserId) q.set("holderId", holderUserId);
  return `/credentials?${q.toString()}`;
}

/**
 * Role-based "what must you have current" checklist. Given a person's clinical
 * role and their actual credentials + malpractice, shows each required document
 * as current / expired / missing. Used on My Portal (self) and the admin person
 * view; nothing renders for non-clinical roles.
 */
export function RequirementsChecklist({ providerType, creds, insurance, holderName, holderUserId }: {
  providerType: ProviderType;
  creds: CredentialRecord[];
  insurance: InsurancePolicyRecord[];
  holderName?: string;
  holderUserId?: string | null;
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
          const href = r.status !== "met" ? addHref(r.key, holderName, holderUserId) : null;
          return (
            <li key={r.key} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
              <span className="flex items-center gap-2">
                <Icon className={`size-4 shrink-0 ${TONE[r.status]}`} />
                <span className={r.status === "missing" ? "text-muted-foreground" : ""}>{r.label}</span>
              </span>
              <span className="flex shrink-0 items-center gap-2">
                {r.note && <span className="hidden text-xs text-muted-foreground sm:inline">{r.note}</span>}
                {href && (
                  <Link href={href} className="inline-flex items-center gap-0.5 text-xs font-medium text-primary hover:underline" title={`Add ${r.label}`}>
                    <Plus className="size-3" /> Add
                  </Link>
                )}
                <Badge variant={r.status === "met" ? "success" : r.status === "expired" ? "warning" : "destructive"}>{STATUS_LABEL[r.status]}</Badge>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
