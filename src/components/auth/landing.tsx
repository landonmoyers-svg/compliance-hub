"use client";

import {
  BadgeCheck,
  CalendarClock,
  FileText,
  ShieldCheck,
  TrendingUp,
  Users,
} from "lucide-react";
import { useAuth } from "@/lib/auth/context";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

const FEATURES = [
  { icon: ShieldCheck, title: "Compliance Management", body: "OSHA, HIPAA, and controlled-substance tracking in one place." },
  { icon: FileText, title: "SOP & Document Library", body: "Versioned policies with review tracking and attestations." },
  { icon: BadgeCheck, title: "Credentials", body: "License and certification expirations, surfaced before they lapse." },
  { icon: Users, title: "HR & Staff", body: "Onboarding, time off, payroll, and performance, role-aware." },
  { icon: CalendarClock, title: "Deadlines", body: "A single calendar of every recurring compliance obligation." },
  { icon: TrendingUp, title: "Executive Insight", body: "A live compliance score and trends for leadership." },
];

/** Public marketing / sign-in screen shown when unauthenticated. */
export function Landing() {
  const { login } = useAuth();

  return (
    <div className="min-h-screen bg-background">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <div className="flex items-center gap-2">
          <ShieldCheck className="size-6 text-primary" />
          <span className="text-base font-semibold">Compliance Hub</span>
        </div>
        <Button onClick={login} size="sm">
          Sign in
        </Button>
      </header>

      <section className="mx-auto max-w-4xl px-6 py-16 text-center sm:py-24">
        <h1 className="text-balance text-4xl font-semibold tracking-tight sm:text-5xl">
          Healthcare compliance, finally in one place.
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-pretty text-lg text-muted-foreground">
          Credentials, OSHA, HIPAA, SOPs, training, and HR — tracked, scored, and
          audit-ready for your practice.
        </p>
        <div className="mt-8 flex justify-center gap-3">
          <Button onClick={login} size="lg">
            Sign in
          </Button>
          <Button onClick={login} size="lg" variant="outline">
            Request access
          </Button>
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl gap-4 px-6 pb-24 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map((f) => (
          <Card key={f.title}>
            <CardContent className="space-y-2 p-5">
              <f.icon className="size-5 text-primary" />
              <h3 className="font-medium">{f.title}</h3>
              <p className="text-sm text-muted-foreground">{f.body}</p>
            </CardContent>
          </Card>
        ))}
      </section>
    </div>
  );
}
