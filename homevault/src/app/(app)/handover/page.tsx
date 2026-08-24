import { KeyRound, Users, Clock, Scale, ArrowRight } from "lucide-react";
import { Card, PageHeader, SectionCard, Badge, DataTable, Row, Cell } from "@/components/ui";
import { getDataClient } from "@/lib/data/client";
import { validatePlan, type HandoverTrigger } from "@/lib/domain/handover";
import { everydayFailsafes } from "@/lib/domain/access";

const MODELS = [
  {
    kind: "dual_key",
    icon: Users,
    name: "Dual-key + trustee",
    body: "Two or more designated key-holders must combine their shares to unlock transfer. A lawyer or trustee can be a mandatory holder. No single party — including HomeVault — can act alone.",
  },
  {
    kind: "inactivity",
    icon: Clock,
    name: "Dead-man's switch",
    body: "If you stop checking in for a configured period, the plan advances automatically after an escalating ladder of reminders and a long grace window. Best paired with human confirmation.",
  },
  {
    kind: "legal_proof",
    icon: Scale,
    name: "Legal-verification",
    body: "A recipient files proof of the event (death certificate, court appointment); a named trustee and/or a verification vendor reviews and approves before access is granted.",
  },
] as const;

function triggerSummary(t: HandoverTrigger): string {
  switch (t.kind) {
    case "dual_key":
      return `Dual-key ${t.threshold}-of-${t.shareCount}${t.requiredHolders.length ? ` (trustee required)` : ""}`;
    case "inactivity":
      return `Dead-man's switch after ${t.inactivityDays} days${t.requireContactConfirmation ? " + contact confirms" : ""}`;
    case "legal_proof":
      return `Legal proof reviewed by trustee${t.requireVendorVerification ? " + vendor" : ""}`;
  }
}

const STAGES = ["ARMED", "PENDING", "VERIFIED", "RELEASED", "COMPLETED"] as const;

export default async function HandoverPage() {
  const data = await getDataClient();
  const [plans, allRecipients] = await Promise.all([data.listPlans(), data.listRecipients()]);

  return (
    <div>
      <PageHeader
        icon={<KeyRound size={22} />}
        title="Estate handover"
        subtitle="Who gets access to what, when, and how it's verified. Nothing here is irreversible until the moment of release."
        description={
          <>
            None of this applies to you opening your own vault. Everything on this page exists for one
            situation — when the people who could grant access are no longer able to.
          </>
        }
      />

      {/* Stated before the machinery, because leading with thresholds and
          trustees makes the product sound like a legal instrument. The cases
          households actually hit need no process at all. */}
      <Card className="mb-6 p-5">
        <h2 className="font-semibold">Before any of this comes into play</h2>
        <ul className="mt-3 flex flex-col gap-3">
          {everydayFailsafes().map((f) => (
            <li key={f.key} className="flex flex-col gap-1 sm:flex-row sm:gap-3">
              <span className="shrink-0 text-sm font-medium sm:w-64">{f.situation}</span>
              <span className="text-sm text-muted">{f.mechanism}</span>
            </li>
          ))}
        </ul>
      </Card>

      <div className="grid gap-6">
        <SectionCard title="Trigger models">
          <div className="grid gap-4 md:grid-cols-3">
            {MODELS.map((m) => (
              <Card key={m.kind} className="p-4">
                <m.icon className="text-accent" size={20} />
                <h3 className="mt-3 font-semibold">{m.name}</h3>
                <p className="mt-2 text-sm text-muted">{m.body}</p>
              </Card>
            ))}
          </div>
          <p className="mt-4 text-sm text-muted">
            Models compose with AND/OR — financial records can require legal proof <b>and</b> two key-holders,
            while household logins release on a dead-man&apos;s switch <b>or</b> two key-holders, so nobody is
            locked out of the Wi-Fi password waiting on probate.
          </p>
        </SectionCard>

        <SectionCard title="Active plans" action={<Badge tone="neutral">{plans.length}</Badge>}>
          <DataTable headers={["Tier", "Triggers", "Recipients", "Grace", "State"]}>
            {plans.map((plan) => {
              const issues = validatePlan(plan);
              const recipients = allRecipients.filter((r) => plan.recipientIds.includes(r.id));
              return (
                <Row key={plan.id}>
                  <Cell className="font-medium capitalize">
                    {plan.tiers.join(" · ")}
                    <div className="mt-1 text-xs font-normal text-muted">
                      {plan.combine === "all" ? "All triggers" : "Any trigger"}
                    </div>
                  </Cell>
                  <Cell>
                    <ul className="flex flex-col gap-1">
                      {plan.triggers.map((t, i) => (
                        <li key={i}>{triggerSummary(t)}</li>
                      ))}
                    </ul>
                    {issues.length > 0 ? (
                      <ul className="mt-2 flex flex-col gap-1">
                        {issues.map((iss, i) => (
                          <li key={i} className="flex items-center gap-2 text-xs">
                            <Badge tone={iss.level === "error" ? "danger" : "warning"}>{iss.level}</Badge>
                            <span className="text-muted">{iss.message}</span>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </Cell>
                  <Cell className="text-muted">
                    {recipients.map((r) => (
                      <div key={r.id}>
                        {r.name} · {r.relationship}
                      </div>
                    ))}
                  </Cell>
                  <Cell className="text-muted">{plan.graceDays} days</Cell>
                  <Cell>
                    <Badge tone="success">{plan.state}</Badge>
                  </Cell>
                </Row>
              );
            })}
          </DataTable>
        </SectionCard>

        <SectionCard title="The ceremony">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            {STAGES.map((s, i) => (
              <span key={s} className="flex items-center gap-2">
                <span className="rounded-md border border-border bg-surface-2 px-3 py-1 font-medium">{s}</span>
                {i < STAGES.length - 1 ? <ArrowRight size={14} className="text-muted" /> : null}
              </span>
            ))}
          </div>
          <p className="mt-4 text-sm text-muted">
            Every transition is logged and notified. A living owner can veto during <b>PENDING</b>; nothing is
            irreversible until <b>RELEASED</b>, when recipients receive key material re-wrapped under their own
            zero-knowledge keys. HomeVault still can&apos;t read anything at any step.
          </p>
        </SectionCard>
      </div>
    </div>
  );
}
