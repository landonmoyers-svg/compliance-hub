"use client";

import { useState } from "react";
import { Sparkles, CheckCircle2, Circle, Plus, Check } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useCreate } from "@/lib/data/hooks";
import { toast } from "sonner";

interface ProposedAction {
  type: string;
  label: string;
  data: Record<string, unknown>;
  done?: boolean;
}

interface ChatMessage {
  role: "assistant" | "user";
  text: string;
  actions?: ProposedAction[];
}

interface Step {
  id: string;
  title: string;
  description: string;
  area: string;
  done: boolean;
}

const SETUP_STEPS: Omit<Step, "done">[] = [
  { id: "locations", title: "Add your locations", description: "Add all clinic locations where staff work.", area: "Foundation" },
  { id: "employees", title: "Import employees", description: "Add your active employees with roles and departments.", area: "Foundation" },
  { id: "credentials", title: "Upload credentials", description: "Add licenses and certifications for each employee.", area: "Credentials" },
  { id: "training", title: "Create training modules", description: "Set up required compliance training in the Training Academy.", area: "Training" },
  { id: "assign-training", title: "Assign training", description: "Assign training modules to all applicable staff.", area: "Training" },
  { id: "sops", title: "Upload SOPs and policies", description: "Add your standard operating procedures and policies to the SOP Library.", area: "Documents" },
  { id: "ack", title: "Set up acknowledgments", description: "Mark policies that require staff acknowledgment.", area: "Documents" },
  { id: "osha", title: "Set up OSHA records", description: "Log any existing OSHA recordable events and HazCom records.", area: "Safety" },
  { id: "sds", title: "Build SDS library", description: "Add Safety Data Sheets for all hazardous products.", area: "Safety" },
  { id: "insurance", title: "Add insurance policies", description: "Upload all active insurance policies with renewal dates.", area: "Insurance" },
  { id: "drills", title: "Schedule emergency drills", description: "Schedule required fire, tornado, and lockdown drills.", area: "Safety" },
  { id: "risk", title: "Review risk cases", description: "Document any open HIPAA or risk incidents.", area: "Risk" },
  { id: "reg-sources", title: "Add regulatory sources", description: "Link applicable federal and state regulations your facility must follow.", area: "Regulatory" },
];

export default function ComplianceConcierge() {
  const [steps, setSteps] = useState<Step[]>(
    SETUP_STEPS.map((s) => ({ ...s, done: false })),
  );

  const [chat, setChat] = useState<ChatMessage[]>([
    {
      role: "assistant",
      text: "Welcome to the Compliance Setup Concierge! I'll guide you through setting up your compliance program. Ask me to set things up — e.g. \"add my Lehi and Provo clinics\" or \"suggest the regulatory sources a Utah psychiatry practice needs\" — and I'll propose records you can create with one click.",
    },
  ]);
  const [input, setInput] = useState("");

  // Entity creators for the propose-and-confirm actions
  const createLocation = useCreate("locations");
  const createTrainingModule = useCreate("trainingModules");
  const createRegulatorySource = useCreate("regulatorySources");
  const createDocument = useCreate("documents");
  const createTask = useCreate("tasks");

  const completed = steps.filter((s) => s.done).length;
  const pct = Math.round((completed / steps.length) * 100);

  function toggleStep(id: string) {
    setSteps((prev) => prev.map((s) => (s.id === id ? { ...s, done: !s.done } : s)));
  }

  const [thinking, setThinking] = useState(false);

  async function sendMessage() {
    const q = input.trim();
    if (!q || thinking) return;
    setInput("");
    const nextChat = [...chat, { role: "user" as const, text: q }];
    setChat(nextChat);
    setThinking(true);
    try {
      const res = await fetch("/api/ai/concierge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: nextChat.map((m) => ({ role: m.role, content: m.text })),
          completedSteps: steps.filter((s) => s.done).map((s) => s.title),
        }),
      });
      const data = await res.json() as { text?: string; actions?: ProposedAction[] };
      setChat((c) => [...c, { role: "assistant", text: data.text ?? "Sorry, something went wrong.", actions: data.actions ?? [] }]);
    } catch {
      setChat((c) => [...c, { role: "assistant", text: "Network error — please try again." }]);
    } finally {
      setThinking(false);
    }
  }

  function str(v: unknown, fallback = ""): string {
    return typeof v === "string" && v.trim() ? v.trim() : fallback;
  }
  function num(v: unknown, fallback: number): number {
    return typeof v === "number" && Number.isFinite(v) ? v : fallback;
  }

  /** Execute a proposed action by creating the entity, then mark it done. */
  async function executeAction(msgIndex: number, actionIndex: number, action: ProposedAction) {
    const d = action.data;
    try {
      switch (action.type) {
        case "create_location":
          await createLocation.mutateAsync({
            name: str(d.name, "New location"),
            type: (["clinic", "office", "remote", "other"].includes(str(d.type)) ? str(d.type) : "clinic") as "clinic" | "office" | "remote" | "other",
            city: str(d.city) || undefined,
            state: str(d.state) || undefined,
            active: true,
          });
          break;
        case "create_training_module":
          await createTrainingModule.mutateAsync({
            title: str(d.title, "New training module"),
            description: str(d.description) || undefined,
            trainingType: str(d.trainingType, "compliance"),
            passingScore: num(d.passingScore, 80),
            active: true,
          });
          break;
        case "create_regulatory_source":
          await createRegulatorySource.mutateAsync({
            title: str(d.title, "New source"),
            citationLabel: str(d.citationLabel) || undefined,
            issuingBody: str(d.issuingBody) || undefined,
            sourceType: (["regulation", "guidance", "internal", "statute"].includes(str(d.sourceType)) ? str(d.sourceType) : "regulation") as "regulation" | "guidance" | "internal" | "statute",
            reviewStatus: "needs_review",
          });
          break;
        case "create_document":
          await createDocument.mutateAsync({
            title: str(d.title, "New document"),
            documentType: str(d.documentType, "policy"),
            complianceArea: str(d.complianceArea) || undefined,
            summary: str(d.summary) || undefined,
            status: "draft",
            accessLevel: "all_staff",
            version: "1.0",
            requiresAcknowledgment: false,
          });
          break;
        case "create_task":
          await createTask.mutateAsync({
            title: str(d.title, "New task"),
            description: str(d.description) || undefined,
            status: "open",
            priority: (["low", "medium", "high", "critical"].includes(str(d.priority)) ? str(d.priority) : "medium") as "low" | "medium" | "high" | "critical",
          });
          break;
        default:
          toast.error("Unknown action type.");
          return;
      }
      setChat((c) => c.map((m, mi) => mi === msgIndex && m.actions
        ? { ...m, actions: m.actions.map((a, ai) => (ai === actionIndex ? { ...a, done: true } : a)) }
        : m));
      toast.success(`Created: ${action.label}`);
    } catch {
      toast.error("Failed to create record.");
    }
  }

  const areas = [...new Set(SETUP_STEPS.map((s) => s.area))];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Setup Concierge"
        description="Your guided compliance setup checklist. Complete each step to build a fully operational compliance program."
      />

      {/* Progress bar */}
      <Card>
        <CardContent className="pt-5">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Sparkles className="size-4 text-primary" />
              <span className="font-medium">Setup progress</span>
            </div>
            <span className="text-sm text-muted-foreground">{completed} / {steps.length} steps</span>
          </div>
          <div className="h-2.5 w-full overflow-hidden rounded-full bg-secondary">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
          <p className="mt-2 text-sm text-muted-foreground">{pct}% complete{pct === 100 ? " 🎉 Setup complete!" : ""}</p>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-5">
        {/* Chat */}
        <Card className="flex flex-col lg:col-span-2" style={{ height: "560px" }}>
          <CardHeader className="border-b border-border pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Sparkles className="size-4 text-primary" />
              Concierge chat
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col overflow-hidden p-0">
            <div className="flex-1 overflow-y-auto space-y-3 p-4">
              {chat.map((m, i) => (
                <div key={i} className={`flex flex-col ${m.role === "user" ? "items-end" : "items-start"}`}>
                  <div className={`max-w-[85%] rounded-xl px-3 py-2 text-sm leading-relaxed ${m.role === "user" ? "bg-primary text-primary-foreground" : "bg-secondary"}`}>
                    {m.text}
                  </div>
                  {m.actions && m.actions.length > 0 && (
                    <div className="mt-2 flex max-w-[85%] flex-col gap-1.5">
                      {m.actions.map((a, ai) => (
                        <button
                          key={ai}
                          onClick={() => !a.done && void executeAction(i, ai, a)}
                          disabled={a.done}
                          className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 text-left text-xs transition-colors ${
                            a.done
                              ? "border-success/40 bg-success/10 text-success"
                              : "border-border bg-card hover:border-primary hover:bg-primary/5"
                          }`}
                        >
                          {a.done ? <Check className="size-3.5 shrink-0" /> : <Plus className="size-3.5 shrink-0 text-primary" />}
                          <span>{a.label}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
              {thinking && (
                <div className="flex justify-start">
                  <div className="rounded-xl bg-secondary px-3 py-2 text-sm text-muted-foreground">Thinking…</div>
                </div>
              )}
            </div>
            <div className="border-t border-border p-3">
              <form onSubmit={(e) => { e.preventDefault(); sendMessage(); }} className="flex gap-2">
                <input
                  className="input flex-1"
                  placeholder="Ask a setup question…"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                />
                <Button type="submit" disabled={!input.trim()}>Send</Button>
              </form>
            </div>
          </CardContent>
        </Card>

        {/* Checklist */}
        <Card className="lg:col-span-3 overflow-y-auto" style={{ maxHeight: "560px" }}>
          <CardHeader className="border-b border-border pb-3">
            <CardTitle className="text-sm">Setup checklist</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {areas.map((area) => (
              <div key={area}>
                <div className="sticky top-0 border-b border-border bg-card px-4 py-2">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{area}</p>
                </div>
                <ul>
                  {steps.filter((s) => s.area === area).map((s) => (
                    <li
                      key={s.id}
                      className="flex items-start gap-3 border-b border-border/50 px-4 py-3 hover:bg-secondary/20 cursor-pointer"
                      onClick={() => toggleStep(s.id)}
                    >
                      {s.done ? (
                        <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success" />
                      ) : (
                        <Circle className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
                      )}
                      <div>
                        <p className={`text-sm font-medium ${s.done ? "line-through text-muted-foreground" : ""}`}>{s.title}</p>
                        <p className="text-xs text-muted-foreground">{s.description}</p>
                      </div>
                      {s.done && <Badge variant="success" className="ml-auto shrink-0">Done</Badge>}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
