import { Users } from "lucide-react";
import { PageHeader, SectionCard, Badge, TierBadge, DataTable, Row, Cell } from "@/components/ui";
import { getDataClient } from "@/lib/data/client";
import type { SensitivityTier } from "@/lib/domain/categories";
import { ROLE_LABEL, ROLE_DESCRIPTION, type MemberRole } from "@/lib/domain/members";

/**
 * People, in Jane's shape: a titled card per group, each holding a table.
 *
 * The members table has a "What they can do" column rather than a bare role
 * chip, because the roles previously granted access their names did not
 * describe. A permission label the reader can't check is exactly how that
 * happened, so the capability is spelled out next to it on the page where
 * someone would go looking.
 */
export default async function PeoplePage() {
  const data = await getDataClient();
  const [members, recipients] = await Promise.all([data.listMembers(), data.listRecipients()]);

  return (
    <div>
      <PageHeader
        icon={<Users size={22} />}
        title="People & recipients"
        subtitle="Household members who use the app, and the recipients who inherit access through a handover."
        description={
          <>
            Members hold the vault under their own keys and can open it whenever they like. Recipients hold
            nothing until a handover completes — being listed here grants no access on its own.
          </>
        }
      />

      <div className="grid gap-6">
        <SectionCard title="Household members">
          <DataTable headers={["Name", "Role", "What they can do"]}>
            {members.map((m) => {
              const role = m.role as MemberRole;
              return (
                <Row key={m.id}>
                  <Cell className="font-medium">{m.name}</Cell>
                  <Cell>
                    <Badge tone={role === "viewer" ? "neutral" : "accent"}>
                      {ROLE_LABEL[role] ?? m.role}
                    </Badge>
                  </Cell>
                  <Cell className="text-muted">{ROLE_DESCRIPTION[role] ?? "—"}</Cell>
                </Row>
              );
            })}
          </DataTable>
          <p className="mt-4 text-sm text-muted">
            Members authenticate with a passkey and their own passphrase, and each holds the vault under their
            own zero-knowledge keys. There is no master key that can open the vault on their behalf — which is
            also why a second member is the simplest safeguard there is against losing access.
          </p>
        </SectionCard>

        <SectionCard title="Designated recipients">
          <DataTable headers={["Name", "Relationship", "Receives", "Type"]}>
            {recipients.map((r) => (
              <Row key={r.id}>
                <Cell className="font-medium">{r.name}</Cell>
                <Cell className="text-muted">{r.relationship}</Cell>
                <Cell>
                  <span className="flex flex-wrap items-center gap-1">
                    {(r.scopeTiers as SensitivityTier[]).map((t) => (
                      <TierBadge key={t} tier={t} />
                    ))}
                  </span>
                </Cell>
                <Cell>
                  <Badge tone={r.isMember ? "neutral" : "accent"}>{r.isMember ? "Member" : "External"}</Badge>
                </Cell>
              </Row>
            ))}
          </DataTable>
          <p className="mt-4 text-sm text-muted">
            A recipient can be someone outside the household — your attorney, for instance. They hold an escrow
            share encrypted to their own public key, and only ever receive the records inside their scope.
          </p>
        </SectionCard>
      </div>
    </div>
  );
}
