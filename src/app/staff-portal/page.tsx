"use client";

import { useMemo, useState } from "react";
import { UserCircle, GraduationCap, FileText, BadgeCheck, CheckCircle2, AlertTriangle, Shield, ListChecks } from "lucide-react";
import Link from "next/link";
import { useAuth } from "@/lib/auth/context";
import { useCollection, useCreate, useUpdate } from "@/lib/data/hooks";
import { TakeQuizDialog } from "@/components/training/take-quiz-dialog";
import type { TrainingAssignment, TrainingModule } from "@/lib/data/schema";
import { toast } from "sonner";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState, EmptyState } from "@/components/shared/states";
import { credentialStatus, assignmentIsOverdue } from "@/lib/compliance";
import { formatDate } from "@/lib/dates";
import { formatName, humanizeLabel } from "@/lib/format";
import { roleLabel } from "@/lib/auth/roles";
import { FileLink } from "@/components/shared/file-link";
import { AddCredentialButton, AddInsuranceButton } from "@/components/portal/self-service-records";

/** A record's name that opens its attached document on click (plain text if none). */
function DocName({ url, name }: { url?: string | null; name: string }) {
  return url
    ? <FileLink path={url} label={name} className="inline-flex items-center gap-1 text-left text-sm font-medium text-primary hover:underline" />
    : <p className="text-sm font-medium">{name}</p>;
}

export default function StaffPortalPage() {
  const { profile, user } = useAuth();
  const myUserId = profile?.userId ?? user?.id ?? "";
  const myName = profile?.fullName ?? user?.fullName ?? "";

  const trainingQ = useCollection("trainingAssignments");
  const modulesQ = useCollection("trainingModules");
  const questionsQ = useCollection("trainingQuestions");
  const credsQ = useCollection("credentials");
  const docsQ = useCollection("documents");
  const acksQ = useCollection("policyAcks");
  const insuranceQ = useCollection("insurancePolicies");
  const createAssign = useCreate("trainingAssignments");
  const updateAssign = useUpdate("trainingAssignments");
  const createAttempt = useCreate("trainingAttempts");

  const [takingQuiz, setTakingQuiz] = useState<TrainingAssignment | null>(null);
  const [busyModuleId, setBusyModuleId] = useState<string | null>(null);

  const training = useMemo(() => trainingQ.data ?? [], [trainingQ.data]);
  const credentials = useMemo(() => credsQ.data ?? [], [credsQ.data]);
  const documents = useMemo(() => docsQ.data ?? [], [docsQ.data]);
  const acks = useMemo(() => acksQ.data ?? [], [acksQ.data]);

  const loading = trainingQ.isLoading || credsQ.isLoading || docsQ.isLoading;
  const isError = trainingQ.isError || credsQ.isError || docsQ.isError;

  const myTraining = useMemo(
    () => training.filter((a) => a.assignedToUserId === myUserId || a.assignedToName === myName),
    [training, myUserId, myName],
  );

  // Self-serve training: every active module, with THIS user's own status.
  const activeModules = useMemo(() => (modulesQ.data ?? []).filter((m) => m.active), [modulesQ.data]);
  const allQuestions = useMemo(() => questionsQ.data ?? [], [questionsQ.data]);
  const questionCountFor = (moduleId: string) => allQuestions.filter((q) => q.trainingModuleId === moduleId).length;
  const myModuleCatalog = useMemo(() => activeModules.map((m) => {
    const mine = myTraining.filter((a) => a.trainingModuleId === m.id);
    const active = mine.find((a) => a.status !== "completed");
    const completed = mine.find((a) => a.status === "completed");
    return { module: m, active: active ?? null, completed: completed ?? null, questions: questionCountFor(m.id) };
  }), [activeModules, myTraining, allQuestions]); // eslint-disable-line react-hooks/exhaustive-deps

  async function completeAssignment(a: TrainingAssignment, score?: number) {
    await updateAssign.mutateAsync({ id: a.id, patch: { status: "completed", completedAt: new Date().toISOString(), ...(score != null && { score }) } });
  }

  /** Record a passed quiz attempt and complete the assignment. */
  async function handleQuizPassed(a: TrainingAssignment, score: number, answers: number[]) {
    try {
      await createAttempt.mutateAsync({
        assignmentId: a.id, trainingModuleId: a.trainingModuleId, moduleTitle: a.moduleTitle,
        userId: myUserId, userName: myName, score, passed: true, answers, completedAt: new Date().toISOString(),
      });
      await completeAssignment(a, score);
      toast.success(`Passed with ${score}% — training complete`);
      void trainingQ.refetch();
    } catch {
      toast.error("Saved your score, but updating the record failed.");
    }
  }

  // Start (or continue/retake) a module: ensure the user has an assignment, then
  // open the quiz — or log an honor-system completion when there's no quiz.
  async function startModule(m: TrainingModule, existing: TrainingAssignment | null, questions: number) {
    setBusyModuleId(m.id);
    try {
      let assignment = existing;
      if (!assignment) {
        const created = await createAssign.mutateAsync({
          trainingModuleId: m.id, moduleTitle: m.title,
          assignedToUserId: myUserId, assignedToName: myName, status: "assigned",
        });
        assignment = created as TrainingAssignment;
        void trainingQ.refetch();
      }
      if (questions > 0) {
        setTakingQuiz(assignment);
      } else {
        if (!window.confirm(`Log completion of "${m.title}"? This records your training completion.`)) return;
        await completeAssignment(assignment);
        toast.success("Training completion logged");
        void trainingQ.refetch();
      }
    } catch {
      toast.error("Couldn't start this training. Please try again.");
    } finally {
      setBusyModuleId(null);
    }
  }
  const myCreds = useMemo(
    () => credentials.filter((c) => c.employeeUserId === myUserId || c.employeeName === myName),
    [credentials, myUserId, myName],
  );
  const staffDocs = useMemo(
    () => documents.filter((d) => d.status === "active" && d.accessLevel === "all_staff"),
    [documents],
  );
  const insurance = useMemo(() => insuranceQ.data ?? [], [insuranceQ.data]);
  const myInsurance = useMemo(
    () => insurance.filter((p) => (myUserId && p.holderUserId === myUserId) || (myName && p.holderName === myName)),
    [insurance, myUserId, myName],
  );

  // Documents requiring acknowledgment, split into pending vs done for this user
  const ackDocs = useMemo(() => documents.filter((d) => d.status === "active" && d.requiresAcknowledgment), [documents]);
  const myAckedDocIds = useMemo(
    () => new Set(acks.filter((a) => a.userId === myUserId && a.status === "acknowledged").map((a) => a.documentId)),
    [acks, myUserId],
  );
  const pendingAcks = useMemo(
    () => ackDocs.filter((d) => !myAckedDocIds.has(d.id)),
    [ackDocs, myAckedDocIds],
  );

  const myTrainingStats = useMemo(() => ({
    completed: myTraining.filter((a) => a.status === "completed").length,
    overdue: myTraining.filter(assignmentIsOverdue).length,
    pending: myTraining.filter((a) => a.status !== "completed" && !assignmentIsOverdue(a)).length,
  }), [myTraining]);

  const expiringCreds = useMemo(
    () => myCreds.filter((c) => { const s = credentialStatus(c); return s === "expiring_soon" || s === "expired"; }).length,
    [myCreds],
  );

  // Combined action items
  const actionItems = useMemo(() => {
    const items: { label: string; href: string; tone: "destructive" | "warning" }[] = [];
    if (myTrainingStats.overdue > 0) items.push({ label: `${myTrainingStats.overdue} overdue training assignment${myTrainingStats.overdue > 1 ? "s" : ""}`, href: "/staff-portal", tone: "destructive" });
    if (expiringCreds > 0) items.push({ label: `${expiringCreds} credential${expiringCreds > 1 ? "s" : ""} expiring or expired`, href: "/credentials", tone: "warning" });
    if (pendingAcks.length > 0) items.push({ label: `${pendingAcks.length} polic${pendingAcks.length > 1 ? "ies" : "y"} awaiting your acknowledgment`, href: "/policy-attestation", tone: "warning" });
    return items;
  }, [myTrainingStats.overdue, expiringCreds, pendingAcks.length]);

  if (isError) {
    return (
      <div className="space-y-6">
        <PageHeader title="My Portal" />
        <ErrorState
          message="We couldn't load your portal."
          onRetry={() => { void trainingQ.refetch(); void credsQ.refetch(); void docsQ.refetch(); }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {takingQuiz && (
        <TakeQuizDialog
          assignment={takingQuiz}
          module={activeModules.find((m) => m.id === takingQuiz.trainingModuleId)}
          questions={allQuestions.filter((q) => q.trainingModuleId === takingQuiz.trainingModuleId)}
          onClose={() => setTakingQuiz(null)}
          onPassed={handleQuizPassed}
        />
      )}

      <PageHeader
        title="My Portal"
        description="Your personal compliance dashboard — action items, training, credentials, and acknowledgments."
      />

      {profile && (
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center gap-4">
              <div className="flex size-14 items-center justify-center rounded-full bg-primary/20 text-xl font-semibold text-primary">
                {profile.fullName.charAt(0).toUpperCase()}
              </div>
              <div>
                <p className="text-lg font-semibold">{formatName(profile.fullName)}</p>
                <p className="text-sm text-muted-foreground">{profile.email}</p>
                <div className="mt-1 flex gap-2">
                  <Badge variant="secondary">{roleLabel(profile.accountRole)}</Badge>
                  {profile.staffRole && <Badge variant="outline">{profile.staffRole}</Badge>}
                  {profile.department && <Badge variant="outline" className="capitalize">{humanizeLabel(profile.department)}</Badge>}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Action items */}
      {!loading && actionItems.length > 0 && (
        <Card className="border-warning/40">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="size-4 text-warning" /> Action needed
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {actionItems.map((item, i) => (
                <li key={i} className="flex items-center justify-between gap-3">
                  <span className={`text-sm ${item.tone === "destructive" ? "text-destructive" : "text-foreground"}`}>{item.label}</span>
                  <Link href={item.href}><Button size="sm" variant="outline">Resolve</Button></Link>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Training completed" value={myTrainingStats.completed} icon={GraduationCap} tone="success" loading={loading} />
        <StatCard label="Training pending" value={myTrainingStats.pending} icon={GraduationCap} tone="warning" loading={loading} />
        <StatCard label="Training overdue" value={myTrainingStats.overdue} icon={GraduationCap} tone={myTrainingStats.overdue ? "destructive" : "default"} loading={loading} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* My training — take any available module, assigned or not */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><GraduationCap className="size-4 text-muted-foreground" /> My training</CardTitle>
          </CardHeader>
          <CardContent>
            {loading || modulesQ.isLoading ? (
              <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
            ) : myModuleCatalog.length === 0 ? (
              <EmptyState icon={GraduationCap} title="No training available" description="Training modules will appear here once they're published." />
            ) : (
              <ul className="divide-y divide-border">
                {myModuleCatalog.map(({ module, active, completed, questions }) => {
                  const overdue = active ? assignmentIsOverdue(active) : false;
                  const done = !!completed && !active;
                  const busy = busyModuleId === module.id;
                  return (
                    <li key={module.id} className="flex items-center justify-between gap-3 py-2.5">
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{module.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {questions > 0 ? `${questions} question${questions !== 1 ? "s" : ""}` : "No quiz"}
                          {active?.dueDate ? ` · due ${formatDate(active.dueDate)}` : ""}
                          {overdue ? " · overdue" : ""}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        {done ? (
                          <>
                            <Badge variant="success">Completed</Badge>
                            <Button size="sm" variant="ghost" disabled={busy} onClick={() => startModule(module, completed, questions)}>Retake</Button>
                          </>
                        ) : (
                          <>
                            {overdue && <Badge variant="destructive">Overdue</Badge>}
                            <Button size="sm" variant={active ? "outline" : "default"} disabled={busy} onClick={() => startModule(module, active, questions)}>
                              {questions > 0 && <ListChecks className="size-4" />}
                              {busy ? "…" : active ? (questions > 0 ? "Take quiz" : "Continue") : "Start"}
                            </Button>
                          </>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* My credentials */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="flex items-center gap-2"><BadgeCheck className="size-4 text-muted-foreground" /> My licenses &amp; credentials</CardTitle>
              <AddCredentialButton myUserId={myUserId} myName={myName} onAdded={() => void credsQ.refetch()} />
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
            ) : myCreds.length === 0 ? (
              <EmptyState icon={BadgeCheck} title="No credentials on file" description="Credentials assigned to you will appear here." />
            ) : (
              <ul className="divide-y divide-border">
                {myCreds.map((c) => {
                  const st = credentialStatus(c);
                  return (
                    <li key={c.id} className="flex items-center justify-between gap-3 py-2.5">
                      <div className="min-w-0">
                        <DocName url={c.documentUrl} name={c.credentialName} />
                        {c.expirationDate && <p className="text-xs text-muted-foreground">Expires {formatDate(c.expirationDate)}</p>}
                      </div>
                      <Badge variant={st === "active" ? "success" : st === "expiring_soon" ? "warning" : st === "expired" ? "destructive" : "secondary"}>
                        {st === "no_expiry" ? "No expiry" : humanizeLabel(st)}
                      </Badge>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* My insurance */}
        <Card>
            <CardHeader>
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="flex items-center gap-2"><Shield className="size-4 text-muted-foreground" /> My insurance</CardTitle>
                <AddInsuranceButton myUserId={myUserId} myName={myName} onAdded={() => void insuranceQ.refetch()} />
              </div>
            </CardHeader>
            <CardContent>
              {myInsurance.length === 0 ? (
                <EmptyState icon={Shield} title="No insurance on file" description="Add a malpractice or liability policy — only you and admins can see it." />
              ) : (
              <ul className="divide-y divide-border">
                {myInsurance.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <DocName url={p.documentUrl} name={p.policyName} />
                      <p className="text-xs text-muted-foreground">{[humanizeLabel(p.policyType), p.carrierName].filter(Boolean).join(" · ")}</p>
                    </div>
                    {p.renewalDate && <span className="shrink-0 text-xs text-muted-foreground">Renews {formatDate(p.renewalDate)}</span>}
                  </li>
                ))}
              </ul>
              )}
            </CardContent>
          </Card>

        {/* My acknowledgments */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><CheckCircle2 className="size-4 text-muted-foreground" /> My acknowledgments</CardTitle>
          </CardHeader>
          <CardContent>
            {docsQ.isLoading || acksQ.isLoading ? (
              <Skeleton className="h-16 w-full" />
            ) : ackDocs.length === 0 ? (
              <EmptyState icon={CheckCircle2} title="Nothing to acknowledge" description="Policies requiring sign-off will appear here." />
            ) : (
              <ul className="divide-y divide-border">
                {ackDocs.map((d) => {
                  const done = myAckedDocIds.has(d.id);
                  return (
                    <li key={d.id} className="flex items-center justify-between gap-3 py-2.5">
                      <DocName url={d.fileUrl} name={d.title} />
                      {done ? (
                        <Badge variant="success">Acknowledged</Badge>
                      ) : (
                        <Link href="/policy-attestation"><Badge variant="warning" className="cursor-pointer">Sign now</Badge></Link>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Staff SOPs */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><FileText className="size-4 text-muted-foreground" /> Staff policies &amp; SOPs</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-24 w-full" />
          ) : staffDocs.length === 0 ? (
            <EmptyState icon={FileText} title="No documents available" />
          ) : (
            <ul className="divide-y divide-border">
              {staffDocs.map((d) => (
                <li key={d.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <DocName url={d.fileUrl} name={d.title} />
                    <p className="text-xs text-muted-foreground">{humanizeLabel(d.documentType)} · v{d.version}</p>
                  </div>
                  {d.requiresAcknowledgment && <Badge variant="warning" className="shrink-0 text-xs">Ack. required</Badge>}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {myUserId === "" && (
        <div className="rounded-lg border border-border bg-secondary/30 p-4 text-sm text-muted-foreground">
          <UserCircle className="mb-1 inline size-4" /> Complete your profile setup to see personalized data.
        </div>
      )}
    </div>
  );
}
