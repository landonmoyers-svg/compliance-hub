"use client";

import { useState } from "react";
import { Building2 } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

type Tab = "organization" | "security" | "notifications";

const TABS: { id: Tab; label: string }[] = [
  { id: "organization", label: "Organization" },
  { id: "security", label: "Security" },
  { id: "notifications", label: "Notifications" },
];

export default function SettingsPage() {
  const [tab, setTab] = useState<Tab>("organization");

  const [orgForm, setOrgForm] = useState({
    orgName: "Lone Peak Psychiatry",
    address: "",
    phone: "",
    website: "",
    npiNumber: "",
    taxId: "",
    documentRetentionYears: "7",
  });

  const [secForm, setSecForm] = useState({
    sessionTimeoutMinutes: "30",
    requireTwoFactor: false,
    passwordMinLength: "12",
  });

  const [notifForm, setNotifForm] = useState({
    credentialReminderDays: "30",
    trainingReminderDays: "14",
    insuranceReminderDays: "60",
    emailNotifications: true,
  });

  function saveOrg(e: React.FormEvent) {
    e.preventDefault();
    if (parseInt(orgForm.documentRetentionYears, 10) < 1) {
      toast.error("Document retention must be at least 1 year");
      return;
    }
    toast.success("Organization settings saved");
  }

  function saveSecurity(e: React.FormEvent) {
    e.preventDefault();
    const timeout = parseInt(secForm.sessionTimeoutMinutes, 10);
    if (isNaN(timeout) || timeout < 5) {
      toast.error("Session timeout must be at least 5 minutes");
      return;
    }
    toast.success("Security settings saved");
  }

  function saveNotifications(e: React.FormEvent) {
    e.preventDefault();
    toast.success("Notification settings saved");
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        description="Configure your organization, security policies, and notification preferences."
      />

      <div className="flex gap-1 border-b border-border">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              tab === t.id
                ? "border-b-2 border-primary text-primary"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "organization" && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="size-4 text-muted-foreground" />
              Organization
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={saveOrg} className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <label className="text-sm font-medium">Organization name *</label>
                <input
                  className="input w-full"
                  value={orgForm.orgName}
                  onChange={(e) => setOrgForm((p) => ({ ...p, orgName: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <label className="text-sm font-medium">Address</label>
                <input
                  className="input w-full"
                  value={orgForm.address}
                  onChange={(e) => setOrgForm((p) => ({ ...p, address: e.target.value }))}
                  placeholder="Street address"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Phone</label>
                <input
                  className="input w-full"
                  value={orgForm.phone}
                  onChange={(e) => setOrgForm((p) => ({ ...p, phone: e.target.value }))}
                  placeholder="(555) 000-0000"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Website</label>
                <input
                  type="url"
                  className="input w-full"
                  value={orgForm.website}
                  onChange={(e) => setOrgForm((p) => ({ ...p, website: e.target.value }))}
                  placeholder="https://…"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">NPI number</label>
                <input
                  className="input w-full"
                  value={orgForm.npiNumber}
                  onChange={(e) => setOrgForm((p) => ({ ...p, npiNumber: e.target.value }))}
                  placeholder="10-digit NPI"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Tax ID (EIN)</label>
                <input
                  className="input w-full"
                  value={orgForm.taxId}
                  onChange={(e) => setOrgForm((p) => ({ ...p, taxId: e.target.value }))}
                  placeholder="XX-XXXXXXX"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Document retention (years)</label>
                <input
                  type="number"
                  min="1"
                  className="input w-full"
                  value={orgForm.documentRetentionYears}
                  onChange={(e) => setOrgForm((p) => ({ ...p, documentRetentionYears: e.target.value }))}
                />
              </div>
              <div className="sm:col-span-2 flex justify-end">
                <Button type="submit">Save organization settings</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {tab === "security" && (
        <Card>
          <CardHeader><CardTitle>Security</CardTitle></CardHeader>
          <CardContent>
            <form onSubmit={saveSecurity} className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Session timeout (minutes)</label>
                <input
                  type="number"
                  min="5"
                  className="input w-full"
                  value={secForm.sessionTimeoutMinutes}
                  onChange={(e) => setSecForm((p) => ({ ...p, sessionTimeoutMinutes: e.target.value }))}
                />
                <p className="text-xs text-muted-foreground">Minimum 5 minutes</p>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Min. password length</label>
                <input
                  type="number"
                  min="8"
                  className="input w-full"
                  value={secForm.passwordMinLength}
                  onChange={(e) => setSecForm((p) => ({ ...p, passwordMinLength: e.target.value }))}
                />
              </div>
              <div className="flex items-center gap-2 sm:col-span-2">
                <input
                  id="2fa"
                  type="checkbox"
                  checked={secForm.requireTwoFactor}
                  onChange={(e) => setSecForm((p) => ({ ...p, requireTwoFactor: e.target.checked }))}
                  className="size-4"
                />
                <label htmlFor="2fa" className="text-sm">Require two-factor authentication for all users</label>
              </div>
              <div className="sm:col-span-2 flex justify-end">
                <Button type="submit">Save security settings</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {tab === "notifications" && (
        <Card>
          <CardHeader><CardTitle>Notifications</CardTitle></CardHeader>
          <CardContent>
            <form onSubmit={saveNotifications} className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Credential reminder (days before expiry)</label>
                <input
                  type="number"
                  min="1"
                  className="input w-full"
                  value={notifForm.credentialReminderDays}
                  onChange={(e) => setNotifForm((p) => ({ ...p, credentialReminderDays: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Training reminder (days before due)</label>
                <input
                  type="number"
                  min="1"
                  className="input w-full"
                  value={notifForm.trainingReminderDays}
                  onChange={(e) => setNotifForm((p) => ({ ...p, trainingReminderDays: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Insurance renewal reminder (days before)</label>
                <input
                  type="number"
                  min="1"
                  className="input w-full"
                  value={notifForm.insuranceReminderDays}
                  onChange={(e) => setNotifForm((p) => ({ ...p, insuranceReminderDays: e.target.value }))}
                />
              </div>
              <div className="flex items-center gap-2">
                <input
                  id="email-notif"
                  type="checkbox"
                  checked={notifForm.emailNotifications}
                  onChange={(e) => setNotifForm((p) => ({ ...p, emailNotifications: e.target.checked }))}
                  className="size-4"
                />
                <label htmlFor="email-notif" className="text-sm">Send email notifications</label>
              </div>
              <div className="sm:col-span-2 flex justify-end">
                <Button type="submit">Save notification settings</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
