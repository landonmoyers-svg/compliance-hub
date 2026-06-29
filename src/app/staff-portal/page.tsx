"use client";

import { useMemo } from "react";
import { UserCircle, GraduationCap, FileText, BadgeCheck } from "lucide-react";
import { useAuth } from "@/lib/auth/context";
import { useCollection } from "@/lib/data/hooks";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState, EmptyState } from "@/components/shared/states";
import { credentialStatus, assignmentIsOverdue } from "@/lib/compliance";
import { formatDate, daysUntil } from "@/lib/dates";
import { roleLabel } from "@/lib/auth/roles";

export default function StaffPortalPage() {
  const { profile } = useAuth();
  const trainingQ = useCollection("trainingAssignments");
  const credsQ = useCollection("credentials");
  const docsQ = useCollection("documents");

  const training = useMemo(() => trainingQ.data ?? [], [trainingQ.data]);
  const credentials = useMemo(() => credsQ.data ?? [], [credsQ.data]);
  const documents = useMemo(() => docsQ.data ?? [], [docsQ.data]);

  const loading = trainingQ.isLoading || credsQ.isLoading || docsQ.isLoading;
  const isError = trainingQ.isError || credsQ.isError || docsQ.isError;

  const myName = profile ? `${profile.fullName}` : "";

  // Filter training to this employee (matched by name since we use mock data)
  const myTraining = useMemo(
    () => training.filter((a) => a.assignedToName === myName),
    [training, myName],
  );

  // Filter credentials to this employee
  const myCreds = useMemo(
    () => credentials.filter((c) => c.employeeName === myName),
    [credentials, myName],
  );

  // Active documents accessible to all staff
  const staffDocs = useMemo(
    () => documents.filter((d) => d.status === "active" && d.accessLevel === "all_staff"),
    [documents],
  );

  const myTrainingStats = useMemo(() => ({
    completed: myTraining.filter((a) => a.status === "completed").length,
    overdue: myTraining.filter(assignmentIsOverdue).length,
    pending: myTraining.filter((a) => a.status !== "completed" && !assignmentIsOverdue(a)).length,
  }), [myTraining]);

  if (isError) {
    return (
      <div className="space-y-6">
        <PageHeader title="My Portal" />
        <ErrorState
          message="We couldn't load your portal."
          onRetry={() => {
            void trainingQ.refetch();
            void credsQ.refetch();
            void docsQ.refetch();
          }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="My Portal"
        description="Your personal compliance dashboard — training, credentials, and documents."
      />

      {/* Profile card */}
      {profile && (
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center gap-4">
              <div className="flex size-14 items-center justify-center rounded-full bg-primary/20 text-xl font-semibold text-primary">
                {profile.fullName.charAt(0).toUpperCase()}
              </div>
              <div>
                <p className="text-lg font-semibold">{profile.fullName}</p>
                <p className="text-sm text-muted-foreground">{profile.email}</p>
                <div className="mt-1 flex gap-2">
                  <Badge variant="secondary">{roleLabel(profile.accountRole)}</Badge>
                  {profile.staffRole && <Badge variant="outline">{profile.staffRole}</Badge>}
                  {profile.department && <Badge variant="outline" className="capitalize">{profile.department}</Badge>}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Training stats */}
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Training completed" value={myTrainingStats.completed} icon={GraduationCap} tone="success" loading={loading} />
        <StatCard label="Pending" value={myTrainingStats.pending} icon={GraduationCap} tone="warning" loading={loading} />
        <StatCard label="Overdue" value={myTrainingStats.overdue} icon={GraduationCap} tone={myTrainingStats.overdue ? "destructive" : "default"} loading={loading} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* My training */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <GraduationCap className="size-4 text-muted-foreground" />
              My training
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
              </div>
            ) : myTraining.length === 0 ? (
              <EmptyState icon={GraduationCap} title="No training assigned" description="Training assigned to you will appear here." />
            ) : (
              <ul className="divide-y divide-border">
                {myTraining.map((a) => {
                  const overdue = assignmentIsOverdue(a);
                  const days = daysUntil(a.dueDate);
                  return (
                    <li key={a.id} className="flex items-center justify-between gap-3 py-2.5">
                      <div>
                        <p className="text-sm font-medium">{a.moduleTitle}</p>
                        {a.dueDate && (
                          <p className="text-xs text-muted-foreground">
                            Due {formatDate(a.dueDate)}
                            {days !== null && a.status !== "completed" && (
                              <span className={overdue ? " text-destructive" : ""}>
                                {" "}({days < 0 ? `${Math.abs(days)}d overdue` : days === 0 ? "today" : `${days}d left`})
                              </span>
                            )}
                          </p>
                        )}
                      </div>
                      <Badge
                        variant={
                          a.status === "completed"
                            ? "success"
                            : overdue
                            ? "destructive"
                            : "secondary"
                        }
                      >
                        {a.status === "completed" ? "Done" : overdue ? "Overdue" : a.status === "in_progress" ? "In progress" : "Assigned"}
                      </Badge>
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
            <CardTitle className="flex items-center gap-2">
              <BadgeCheck className="size-4 text-muted-foreground" />
              My credentials
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
              </div>
            ) : myCreds.length === 0 ? (
              <EmptyState icon={BadgeCheck} title="No credentials on file" description="Credentials assigned to you will appear here." />
            ) : (
              <ul className="divide-y divide-border">
                {myCreds.map((c) => {
                  const st = credentialStatus(c);
                  return (
                    <li key={c.id} className="flex items-center justify-between gap-3 py-2.5">
                      <div>
                        <p className="text-sm font-medium">{c.credentialName}</p>
                        {c.expirationDate && (
                          <p className="text-xs text-muted-foreground">Expires {formatDate(c.expirationDate)}</p>
                        )}
                      </div>
                      <Badge
                        variant={
                          st === "active" ? "success"
                          : st === "expiring_soon" ? "warning"
                          : st === "expired" ? "destructive"
                          : "secondary"
                        }
                      >
                        {st === "no_expiry" ? "No expiry" : st.replace("_", " ")}
                      </Badge>
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
          <CardTitle className="flex items-center gap-2">
            <FileText className="size-4 text-muted-foreground" />
            Staff policies &amp; SOPs
          </CardTitle>
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
                  <div>
                    <p className="text-sm font-medium">{d.title}</p>
                    <p className="text-xs text-muted-foreground capitalize">{d.documentType} · v{d.version}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {d.requiresAcknowledgment && (
                      <Badge variant="warning" className="text-xs">Ack. required</Badge>
                    )}
                    {d.fileUrl && (
                      <a href={d.fileUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline">
                        View
                      </a>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {myName === "" && (
        <div className="rounded-lg border border-border bg-secondary/30 p-4 text-sm text-muted-foreground">
          <UserCircle className="mb-1 inline size-4" /> Your portal is filtered by your name. Complete your profile setup to see personalized data.
        </div>
      )}
    </div>
  );
}
