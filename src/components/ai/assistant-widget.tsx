"use client";

import { useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Sparkles, X, Send, Plus, Check } from "lucide-react";
import { useCreate, useUpdate } from "@/lib/data/hooks";
import { useAuth } from "@/lib/auth/context";
import { provisionLogin } from "@/lib/admin";
import { capabilityForPath } from "@/lib/ai/page-capabilities";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface ProposedAction { type: string; label: string; data: Record<string, unknown>; done?: boolean; }
interface Msg { role: "assistant" | "user"; text: string; actions?: ProposedAction[]; }

function str(v: unknown, fallback = ""): string { return typeof v === "string" && v.trim() ? v.trim() : fallback; }
function num(v: unknown, fallback: number): number { return typeof v === "number" && Number.isFinite(v) ? v : fallback; }
function pick<T extends string>(v: unknown, allowed: readonly T[], fallback: T): T {
  return (typeof v === "string" && (allowed as readonly string[]).includes(v)) ? (v as T) : fallback;
}

export function AssistantWidget() {
  const pathname = usePathname() || "/";
  const page = useMemo(() => capabilityForPath(pathname), [pathname]);
  const { profile, isAdmin } = useAuth();

  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  // Creators for every action the assistant can execute.
  const createTask = useCreate("tasks");
  const createLocation = useCreate("locations");
  const createEmployee = useCreate("employees");
  const updateEmployee = useUpdate("employees");
  const createCredential = useCreate("credentials");
  const createDocument = useCreate("documents");
  const createTrainingModule = useCreate("trainingModules");
  const createRegulatorySource = useCreate("regulatorySources");
  const createVendor = useCreate("vendors");
  const createInventory = useCreate("inventory");
  const createRiskCase = useCreate("riskCases");
  const createSds = useCreate("sdsRecords");
  const createInsurance = useCreate("insurancePolicies");
  const createDrill = useCreate("emergencyDrills");

  // Don't render for signed-out users.
  if (!profile) return null;

  function scrollDown() { setTimeout(() => endRef.current?.scrollIntoView({ behavior: "smooth" }), 40); }

  async function send(text?: string) {
    const q = (text ?? input).trim();
    if (!q || thinking) return;
    setInput("");
    const next = [...messages, { role: "user" as const, text: q }];
    setMessages(next);
    setThinking(true);
    scrollDown();
    try {
      const res = await fetch("/api/ai/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: next.map((m) => ({ role: m.role, content: m.text })),
          path: pathname,
          today: new Date().toISOString().slice(0, 10),
        }),
      });
      const data = await res.json() as { text?: string; error?: string; actions?: ProposedAction[] };
      const answer = data.text ?? data.error ?? "Sorry, something went wrong.";
      setMessages((m) => [...m, { role: "assistant", text: answer, actions: data.actions ?? [] }]);
    } catch {
      setMessages((m) => [...m, { role: "assistant", text: "Network error — please try again." }]);
    } finally {
      setThinking(false);
      scrollDown();
    }
  }

  function markDone(mi: number, ai: number) {
    setMessages((c) => c.map((m, i) => i === mi && m.actions
      ? { ...m, actions: m.actions.map((a, j) => (j === ai ? { ...a, done: true } : a)) } : m));
  }

  async function executeAction(mi: number, ai: number, action: ProposedAction) {
    const d = action.data;
    try {
      switch (action.type) {
        case "create_task":
          await createTask.mutateAsync({ title: str(d.title, "New task"), description: str(d.description) || undefined, status: "open", priority: pick(d.priority, ["low", "medium", "high", "critical"] as const, "medium") });
          break;
        case "create_location":
          await createLocation.mutateAsync({ name: str(d.name, "New location"), type: pick(d.type, ["clinic", "office", "remote", "other"] as const, "clinic"), city: str(d.city) || undefined, state: str(d.state) || undefined, active: true });
          break;
        case "create_credential":
          await createCredential.mutateAsync({ employeeName: str(d.employeeName, "Unassigned"), credentialName: str(d.credentialName, "New credential"), credentialType: pick(d.credentialType, ["license", "certification", "dea", "cpr_bls_acls", "immunization", "background_check", "other"] as const, "license"), issuingBody: str(d.issuingBody) || undefined, credentialNumber: str(d.credentialNumber) || undefined, issueDate: str(d.issueDate) || null, expirationDate: str(d.expirationDate) || null });
          break;
        case "create_document":
          await createDocument.mutateAsync({ title: str(d.title, "New document"), documentType: str(d.documentType, "policy"), complianceArea: str(d.complianceArea) || undefined, summary: str(d.summary) || undefined, status: "draft", accessLevel: "all_staff", version: "1.0", requiresAcknowledgment: false });
          break;
        case "create_training_module":
          await createTrainingModule.mutateAsync({ title: str(d.title, "New training module"), description: str(d.description) || undefined, trainingType: str(d.trainingType, "compliance"), passingScore: num(d.passingScore, 80), active: true });
          break;
        case "create_regulatory_source":
          await createRegulatorySource.mutateAsync({ title: str(d.title, "New source"), citationLabel: str(d.citationLabel) || undefined, issuingBody: str(d.issuingBody) || undefined, sourceType: pick(d.sourceType, ["regulation", "guidance", "internal", "statute"] as const, "regulation"), reviewStatus: "needs_review" });
          break;
        case "create_vendor":
          await createVendor.mutateAsync({ vendorName: str(d.vendorName, "New vendor"), vendorType: pick(d.vendorType, ["business_associate", "contractor", "supplier", "service_provider", "consultant", "other"] as const, "service_provider"), contactEmail: str(d.contactEmail) || undefined, hasAccessToPHI: d.baaRequired === true, baaRequired: d.baaRequired === true, baaStatus: d.baaRequired === true ? "pending" : "not_required", status: "active" });
          break;
        case "create_inventory_item": {
          const cents = typeof d.estimatedValueUsd === "number" ? Math.round(d.estimatedValueUsd * 100) : null;
          await createInventory.mutateAsync({ itemName: str(d.itemName, "New item"), itemType: str(d.itemType, "equipment"), status: "active", condition: pick(d.condition, ["new", "good", "fair", "poor"] as const, "good"), quantity: num(d.quantity, 1), estimatedValueCents: cents, sublocation: str(d.sublocation) || null, removedFromInventory: false, aiIdentified: false });
          break;
        }
        case "create_risk_case":
          await createRiskCase.mutateAsync({ caseTitle: str(d.caseTitle, "New case"), caseType: str(d.caseType, "clinical"), description: str(d.description) || undefined, severity: pick(d.severity, ["low", "medium", "high", "critical"] as const, "medium"), status: "open", accessLevel: "standard", incidentDate: str(d.incidentDate) || null });
          break;
        case "create_sds_record":
          await createSds.mutateAsync({ productName: str(d.productName, "New product"), manufacturer: str(d.manufacturer) || undefined, signalWord: pick(d.signalWord, ["DANGER", "WARNING", "CAUTION", "NONE"] as const, "NONE"), status: "active" });
          break;
        case "create_insurance_policy":
          await createInsurance.mutateAsync({ policyName: str(d.policyName, "New policy"), policyType: str(d.policyType, "malpractice"), carrierName: str(d.carrierName) || undefined, policyNumber: str(d.policyNumber) || undefined, renewalDate: str(d.renewalDate) || null });
          break;
        case "create_emergency_drill":
          await createDrill.mutateAsync({ drillTitle: str(d.drillTitle, "New drill"), drillType: str(d.drillType, "fire"), scheduledDate: str(d.scheduledDate) || null, status: "scheduled", participantCount: 0 });
          break;
        case "create_employee": {
          const email = str(d.email).toLowerCase();
          if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { toast.error("I need a valid email to add this employee."); return; }
          const firstName = str(d.firstName, "New");
          const lastName = str(d.lastName, "Employee");
          const dept = pick(d.department, ["ownership", "administration", "clinical", "hr", "billing", "front_desk", "operations", "contractor", "other"] as const, "other");
          const created = await createEmployee.mutateAsync({ firstName, lastName, email, title: str(d.title) || undefined, department: dept, employmentStatus: "active" });
          if (d.invite !== false) {
            const role = pick(d.accountRole, ["owner", "admin", "hr", "clinical_leadership", "manager", "staff", "contractor", "read_only"] as const, "staff");
            const result = await provisionLogin({ email, fullName: `${firstName} ${lastName}`, accountRole: role, staffRole: str(d.title) || undefined, department: dept });
            if (result.ok && result.userId) await updateEmployee.mutateAsync({ id: created.id, patch: { userId: result.userId } });
            else if (!result.ok) toast.error(`Employee added, but login failed: ${result.error}`);
          }
          markDone(mi, ai);
          toast.success(`Added ${firstName} ${lastName}`);
          return;
        }
        default:
          toast.error("That action isn't supported here.");
          return;
      }
      markDone(mi, ai);
      toast.success(`Created: ${action.label}`);
    } catch {
      toast.error("Couldn't create that record. You may not have permission, or a field was invalid.");
    }
  }

  const examples = page.examples;

  return (
    <>
      {/* Launcher */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-5 right-5 z-40 flex items-center gap-2 rounded-full bg-primary px-4 py-3 text-sm font-medium text-primary-foreground shadow-lg transition-transform hover:scale-105"
          aria-label="Open AI assistant"
        >
          <Sparkles className="size-5" />
          <span className="hidden sm:inline">Ask AI</span>
        </button>
      )}

      {/* Panel */}
      {open && (
        <div className="fixed bottom-5 right-5 z-40 flex h-[560px] w-[calc(100vw-2.5rem)] max-w-[400px] flex-col rounded-2xl border border-border bg-card shadow-2xl">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div className="flex items-center gap-2">
              <Sparkles className="size-4 text-primary" />
              <div>
                <p className="text-sm font-semibold leading-none">Assistant</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{page.title}</p>
              </div>
            </div>
            <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground" aria-label="Close"><X className="size-4" /></button>
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto p-4">
            {messages.length === 0 && (
              <div className="space-y-3">
                <div className="rounded-xl bg-secondary px-3 py-2 text-sm">
                  I can help with <span className="font-medium">{page.title}</span> — {page.purpose} Ask me to do something, and I’ll set it up for you to confirm.
                </div>
                <div className="flex flex-col gap-1.5">
                  {examples.map((ex) => (
                    <button key={ex} onClick={() => void send(ex)} className="rounded-lg border border-border px-3 py-1.5 text-left text-xs text-muted-foreground hover:border-primary hover:bg-primary/5">
                      {ex}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((m, mi) => (
              <div key={mi} className={`flex flex-col ${m.role === "user" ? "items-end" : "items-start"}`}>
                <div className={`max-w-[88%] whitespace-pre-wrap rounded-xl px-3 py-2 text-sm leading-relaxed ${m.role === "user" ? "bg-primary text-primary-foreground" : "bg-secondary"}`}>{m.text}</div>
                {m.actions && m.actions.length > 0 && (
                  <div className="mt-2 flex max-w-[88%] flex-col gap-1.5">
                    {m.actions.map((a, ai) => (
                      <button
                        key={ai}
                        onClick={() => !a.done && void executeAction(mi, ai, a)}
                        disabled={a.done}
                        className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 text-left text-xs transition-colors ${a.done ? "border-success/40 bg-success/10 text-success" : "border-border bg-card hover:border-primary hover:bg-primary/5"}`}
                      >
                        {a.done ? <Check className="size-3.5 shrink-0" /> : <Plus className="size-3.5 shrink-0 text-primary" />}
                        <span>{a.label}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {thinking && <div className="flex justify-start"><div className="rounded-xl bg-secondary px-3 py-2 text-sm text-muted-foreground">Thinking…</div></div>}
            <div ref={endRef} />
          </div>

          <div className="border-t border-border p-3">
            <form onSubmit={(e) => { e.preventDefault(); void send(); }} className="flex gap-2">
              <input className="input flex-1" placeholder={`Ask about ${page.title}…`} value={input} onChange={(e) => setInput(e.target.value)} disabled={thinking} />
              <Button type="submit" disabled={!input.trim() || thinking} aria-label="Send"><Send className="size-4" /></Button>
            </form>
            {!isAdmin && <p className="mt-1.5 text-[11px] text-muted-foreground">Some actions may require admin permissions.</p>}
          </div>
        </div>
      )}
    </>
  );
}
