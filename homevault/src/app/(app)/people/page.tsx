import { Users, UserCircle, KeyRound } from "lucide-react";
import { Card, PageHeader, Badge, TierBadge } from "@/components/ui";
import { getDataClient } from "@/lib/data/client";
import type { SensitivityTier } from "@/lib/domain/categories";

const ROLE_LABEL: Record<string, string> = {
  owner: "Owner",
  co_owner: "Co-owner",
  viewer: "Viewer",
};

export default async function PeoplePage() {
  const data = getDataClient();
  const [members, recipients] = await Promise.all([data.listMembers(), data.listRecipients()]);

  return (
    <div>
      <PageHeader
        icon={<Users size={22} />}
        title="People & recipients"
        subtitle="Household members who use the app, and the designated recipients who inherit access through a handover."
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-5">
          <div className="mb-3 flex items-center gap-2">
            <UserCircle size={18} className="text-accent" />
            <h2 className="font-semibold">Household members</h2>
          </div>
          <ul className="flex flex-col divide-y divide-border">
            {members.map((m) => (
              <li key={m.id} className="flex items-center justify-between py-3">
                <span className="text-sm font-medium">{m.name}</span>
                <Badge tone={m.role === "owner" ? "accent" : "neutral"}>{ROLE_LABEL[m.role]}</Badge>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-muted">
            Members authenticate with a passkey and their own passphrase. Each holds the vault under their own
            zero-knowledge keys — the app has no master key that can open the vault for them.
          </p>
        </Card>

        <Card className="p-5">
          <div className="mb-3 flex items-center gap-2">
            <KeyRound size={18} className="text-accent" />
            <h2 className="font-semibold">Designated recipients</h2>
          </div>
          <ul className="flex flex-col divide-y divide-border">
            {recipients.map((r) => (
              <li key={r.id} className="py-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{r.name}</span>
                  <Badge tone={r.isMember ? "neutral" : "accent"}>{r.isMember ? "member" : "external"}</Badge>
                </div>
                <div className="mt-1 flex items-center gap-2 text-xs text-muted">
                  <span>{r.relationship}</span>
                  <span>·</span>
                  <span className="flex items-center gap-1">
                    scope:
                    {(r.scopeTiers as SensitivityTier[]).map((t) => (
                      <TierBadge key={t} tier={t} />
                    ))}
                  </span>
                </div>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-muted">
            A recipient can be a non-member (e.g. your attorney), holds an escrow share encrypted to their own
            public key, and only ever receives the records within their entitlement scope.
          </p>
        </Card>
      </div>
    </div>
  );
}
