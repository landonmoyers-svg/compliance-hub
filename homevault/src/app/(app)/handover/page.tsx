import { KeyRound, Users, Clock, Scale, ShieldCheck, ArrowRight } from "lucide-react";
import { Card, PageHeader, Badge } from "@/components/ui";
import { getDataClient } from "@/lib/data/client";
import { validatePlan, type HandoverTrigger } from "@/lib/domain/handover";

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

const STAGES = [
  "ARMED",
  "PENDING",
  "VERIFIED",
  "RELEASED",
  "COMPLETED",
] as const;

export default async function HandoverPage() {
  const data = getDataClient();
  const [plans, allRecipients] = await Promise.all([data.listPlans(), data.listRecipients()]);

  return (
    <div>
      <PageHeader
        icon={<KeyRound size={22} />}
        title="Estate handover"
        subtitle="Configure who gets access to what, when, and how it's verified. Handover is reversible until the moment of release."
      />

      <section className="mb-8">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">Choose a trigger model per tier</h2>
        <div className="grid gap-4 md:grid-cols-3">
          {MODELS.map((m) => (
            <Card key={m.kind} className="card-gradient p-5">
              <m.icon className="text-accent" size={22} />
              <h3 className="mt-3 font-semibold">{m.name}</h3>
              <p className="mt-2 text-sm text-muted">{m.body}</p>
            </Card>
          ))}
        </div>
        <p className="mt-3 text-xs text-muted">
          Models compose with AND/OR — e.g. financial records require legal proof <b>and</b> two key-holders,
          while household logins release on a dead-man&apos;s switch <b>or</b> two key-holders, so the family
          isn&apos;t locked out of the Wi-Fi password waiting on probate.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">Your active plans</h2>
        <div className="grid gap-4">
          {plans.map((plan) => {
            const issues = validatePlan(plan);
            const recipients = allRecipients.filter((r) => plan.recipientIds.includes(r.id));
            return (
              <Card key={plan.id} className="p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <ShieldCheck size={18} className="text-accent" />
                    <span className="font-semibold capitalize">{plan.tiers.join(" · ")} tier</span>
                    <Badge tone="success">{plan.state}</Badge>
                    <Badge tone="neutral">{plan.combine === "all" ? "ALL triggers" : "ANY trigger"}</Badge>
                    <Badge tone="neutral">{plan.graceDays}-day grace</Badge>
                  </div>
                  <div className="text-xs text-muted">
                    {issues.length === 0 ? "No issues" : `${issues.length} note(s)`}
                  </div>
                </div>

                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <div>
                    <div className="text-xs font-medium text-muted">Triggers</div>
                    <ul className="mt-1 flex flex-col gap-1">
                      {plan.triggers.map((t, i) => (
                        <li key={i} className="text-sm">
                          {triggerSummary(t)}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <div className="text-xs font-medium text-muted">Recipients</div>
                    <ul className="mt-1 flex flex-col gap-1">
                      {recipients.map((r) => (
                        <li key={r.id} className="text-sm">
                          {r.name} <span className="text-muted">· {r.relationship}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                {issues.length > 0 ? (
                  <ul className="mt-4 flex flex-col gap-1 rounded-lg border border-border bg-surface-2 p-3">
                    {issues.map((iss, i) => (
                      <li key={i} className="flex items-center gap-2 text-xs">
                        <Badge tone={iss.level === "error" ? "danger" : "warning"}>{iss.level}</Badge>
                        <span className="text-muted">{iss.message}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </Card>
            );
          })}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">The ceremony</h2>
        <Card className="p-5">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            {STAGES.map((s, i) => (
              <span key={s} className="flex items-center gap-2">
                <span className="rounded-lg border border-border bg-surface-2 px-3 py-1 font-medium">{s}</span>
                {i < STAGES.length - 1 ? <ArrowRight size={14} className="text-muted" /> : null}
              </span>
            ))}
          </div>
          <p className="mt-4 text-sm text-muted">
            Every transition is logged and notified. A living owner can veto during <b>PENDING</b>; nothing is
            irreversible until <b>RELEASED</b>, when recipients receive key material re-wrapped under their own
            zero-knowledge keys. HomeVault still can&apos;t read anything at any step.
          </p>
        </Card>
      </section>
    </div>
  );
}
