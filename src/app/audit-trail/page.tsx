"use client";

import { useState, useMemo } from "react";
import { Shield, Search, Download } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/states";

// In production this would come from a server-side HIPAA audit log.
// Mock entries represent what should be logged: entity type, action, actor, timestamp.
interface AuditEntry {
  id: string;
  timestamp: string;
  actor: string;
  action: "view" | "create" | "update" | "delete" | "export" | "login" | "logout" | "failed_login";
  entityType: string;
  entityLabel: string;
  details?: string;
}

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(Math.floor(Math.random() * 12) + 7, Math.floor(Math.random() * 60));
  return d.toISOString();
}

const MOCK_LOG: AuditEntry[] = [
  { id: "a1", timestamp: daysAgo(0), actor: "Jane Doe", action: "view", entityType: "CredentialRecord", entityLabel: "RN License — Sarah Mitchell", details: "Viewed credential detail" },
  { id: "a2", timestamp: daysAgo(0), actor: "Jane Doe", action: "update", entityType: "CredentialRecord", entityLabel: "RN License — Sarah Mitchell", details: "Updated expiration date" },
  { id: "a3", timestamp: daysAgo(0), actor: "admin@lonepeak.com", action: "login", entityType: "Session", entityLabel: "Admin login", details: "Successful login" },
  { id: "a4", timestamp: daysAgo(1), actor: "Jane Doe", action: "create", entityType: "RiskManagementCase", entityLabel: "Medication Discrepancy #4", details: "New case created" },
  { id: "a5", timestamp: daysAgo(1), actor: "Jane Doe", action: "view", entityType: "RiskManagementCase", entityLabel: "Medication Discrepancy #4", details: "Restricted case accessed" },
  { id: "a6", timestamp: daysAgo(1), actor: "Mike Carter", action: "update", entityType: "TrainingAssignment", entityLabel: "HIPAA Privacy — Sarah Mitchell", details: "Marked complete" },
  { id: "a7", timestamp: daysAgo(2), actor: "Jane Doe", action: "export", entityType: "CredentialRecord", entityLabel: "Credentials Report", details: "CSV export downloaded" },
  { id: "a8", timestamp: daysAgo(2), actor: "unknown", action: "failed_login", entityType: "Session", entityLabel: "Failed login attempt", details: "Invalid password — 3rd attempt" },
  { id: "a9", timestamp: daysAgo(3), actor: "Jane Doe", action: "create", entityType: "PolicyAcknowledgment", entityLabel: "HIPAA Privacy Policy — Jane Doe", details: "Acknowledgment recorded" },
  { id: "a10", timestamp: daysAgo(3), actor: "Mike Carter", action: "update", entityType: "Employee", entityLabel: "Sarah Mitchell", details: "Department changed: clinical → administrative" },
  { id: "a11", timestamp: daysAgo(4), actor: "Jane Doe", action: "delete", entityType: "InventoryItem", entityLabel: "Blood Pressure Monitor #2", details: "Item marked removed" },
  { id: "a12", timestamp: daysAgo(5), actor: "Mike Carter", action: "create", entityType: "OSHARecord", entityLabel: "Needle-stick Incident", details: "OSHA record logged" },
  { id: "a13", timestamp: daysAgo(5), actor: "Jane Doe", action: "view", entityType: "InsurancePolicyRecord", entityLabel: "Professional Liability", details: "Policy details viewed" },
  { id: "a14", timestamp: daysAgo(7), actor: "Jane Doe", action: "update", entityType: "ComplianceDocument", entityLabel: "HIPAA Privacy Policy", details: "Version bumped 3.0 → 3.1" },
  { id: "a15", timestamp: daysAgo(7), actor: "admin@lonepeak.com", action: "logout", entityType: "Session", entityLabel: "Admin logout", details: "" },
];

const ACTION_VARIANT: Record<AuditEntry["action"], "success" | "warning" | "destructive" | "secondary" | "default"> = {
  view: "secondary",
  create: "success",
  update: "default",
  delete: "destructive",
  export: "warning",
  login: "secondary",
  logout: "secondary",
  failed_login: "destructive",
};

export default function AuditTrailPage() {
  const [search, setSearch] = useState("");
  const [filterAction, setFilterAction] = useState<AuditEntry["action"] | "all">("all");

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return MOCK_LOG.filter((e) => {
      if (filterAction !== "all" && e.action !== filterAction) return false;
      if (
        q &&
        !e.actor.toLowerCase().includes(q) &&
        !e.entityType.toLowerCase().includes(q) &&
        !e.entityLabel.toLowerCase().includes(q) &&
        !(e.details ?? "").toLowerCase().includes(q)
      )
        return false;
      return true;
    });
  }, [search, filterAction]);

  function exportCSV() {
    const header = ["Timestamp", "Actor", "Action", "Entity Type", "Entity", "Details"];
    const rows = filtered.map((e) => [
      e.timestamp,
      e.actor,
      e.action,
      e.entityType,
      e.entityLabel,
      e.details ?? "",
    ]);
    const csv = [header, ...rows]
      .map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "audit-trail.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  function formatTs(iso: string) {
    try {
      return new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      }).format(new Date(iso));
    } catch {
      return iso;
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Audit Trail"
        description="HIPAA-compliant log of all data access, changes, exports, and authentication events."
        actions={
          <Button variant="outline" onClick={exportCSV}>
            <Download className="size-4" /> Export CSV
          </Button>
        }
      />

      <div className="rounded-lg border border-border bg-secondary/30 px-4 py-3 text-sm text-muted-foreground">
        <Shield className="inline size-4 mr-1.5 -mt-0.5" />
        In production, this log is written server-side with tamper-evident storage, real IP addresses (not exposed to browser), and server timestamps (UTC). Entries are immutable after creation. Showing demo data.
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                className="input w-full pl-9"
                placeholder="Search actor, entity, or details…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <select
              className="input"
              value={filterAction}
              onChange={(e) => setFilterAction(e.target.value as AuditEntry["action"] | "all")}
            >
              <option value="all">All actions</option>
              <option value="view">View</option>
              <option value="create">Create</option>
              <option value="update">Update</option>
              <option value="delete">Delete</option>
              <option value="export">Export</option>
              <option value="login">Login</option>
              <option value="failed_login">Failed login</option>
            </select>
          </div>
        </CardHeader>
        <CardContent>
          {filtered.length === 0 ? (
            <EmptyState icon={Shield} title="No audit entries found" description="Try adjusting your search or filter." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th className="pb-2 pr-4 font-medium">Timestamp</th>
                    <th className="pb-2 pr-4 font-medium">Actor</th>
                    <th className="pb-2 pr-4 font-medium">Action</th>
                    <th className="pb-2 pr-4 font-medium">Entity</th>
                    <th className="pb-2 font-medium">Details</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((e) => (
                    <tr key={e.id} className="border-b border-border/50 hover:bg-secondary/20">
                      <td className="py-2.5 pr-4 tabular-nums text-muted-foreground whitespace-nowrap">
                        {formatTs(e.timestamp)}
                      </td>
                      <td className="py-2.5 pr-4 font-medium">{e.actor}</td>
                      <td className="py-2.5 pr-4">
                        <Badge variant={ACTION_VARIANT[e.action]} className="capitalize">
                          {e.action === "failed_login" ? "Failed login" : e.action}
                        </Badge>
                      </td>
                      <td className="py-2.5 pr-4">
                        <div className="text-xs text-muted-foreground">{e.entityType}</div>
                        <div>{e.entityLabel}</div>
                      </td>
                      <td className="py-2.5 text-muted-foreground">{e.details || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
