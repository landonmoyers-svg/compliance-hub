"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  X, ChevronRight, ChevronLeft, Check, ArrowRight, MessageSquare,
  PanelRight, Target, CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { useGuide, askSage, type GuideStyle } from "@/lib/guide/context";

const STYLE_TABS: { id: GuideStyle; label: string; icon: typeof PanelRight }[] = [
  { id: "panel", label: "Panel", icon: PanelRight },
  { id: "tour", label: "Tour", icon: Target },
  { id: "chat", label: "Chat", icon: MessageSquare },
];

/** Mounted once in the app frame. Renders the active playbook walkthrough in the
 *  user's chosen style, or nothing when no walkthrough is running. */
export function GuideDock() {
  const g = useGuide();
  const router = useRouter();
  const pathname = usePathname();

  // When the step changes, take the user to the page that step lives on.
  // Depend only on active/stepIndex (not pathname) so this doesn't loop.
  const active = g.active;
  const stepIndex = g.stepIndex;
  useEffect(() => {
    if (!active) return;
    const step = active.steps[stepIndex];
    if (step?.route && window.location.pathname !== step.route) {
      router.push(step.route);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, stepIndex]);

  if (!active) return null;
  const step = active.steps[stepIndex];
  const total = active.steps.length;
  const onPage = pathname === step.route;

  const styleSwitcher = (
    <div className="flex items-center gap-0.5 rounded-lg bg-secondary p-0.5">
      {STYLE_TABS.map((t) => (
        <button
          key={t.id}
          onClick={() => g.setStyle(t.id)}
          className={cn(
            "flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors",
            g.style === t.id ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
          )}
          title={`${t.label} style`}
        >
          <t.icon className="size-3.5" /> {t.label}
        </button>
      ))}
    </div>
  );

  const advance = () => {
    if (stepIndex < total - 1) g.next();
    else g.stop();
  };

  // ---- CHAT style: a slim bar that hands each step to Sage ----------------
  if (g.style === "chat") {
    return (
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 px-4 py-3 backdrop-blur-xl lg:pl-72">
        <div className="mx-auto flex max-w-4xl items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs text-muted-foreground">{active.title} · Step {stepIndex + 1} of {total}</p>
            <p className="truncate text-sm font-medium">{step.title}</p>
          </div>
          <Button size="sm" variant="outline" onClick={() => askSage(step.ask ?? `${step.title}. ${step.how}`)}>
            <MessageSquare className="size-4" /> Ask Sage
          </Button>
          {!onPage && <Button asChild size="sm" variant="ghost"><Link href={step.route}>Open <ArrowRight className="size-4" /></Link></Button>}
          <Button size="sm" variant="ghost" onClick={() => g.prev()} disabled={stepIndex === 0}><ChevronLeft className="size-4" /></Button>
          <Button size="sm" onClick={advance}>{stepIndex < total - 1 ? "Next" : "Finish"}</Button>
          {styleSwitcher}
          <Button size="sm" variant="ghost" onClick={() => g.stop()} aria-label="Close guide"><X className="size-4" /></Button>
        </div>
      </div>
    );
  }

  // ---- TOUR style: spotlight the actual control on the page --------------
  if (g.style === "tour") {
    return <GuideTour onAdvance={advance} styleSwitcher={styleSwitcher} onPage={onPage} />;
  }

  // ---- PANEL style (default): the persistent guided coach panel ----------
  return (
    <div className="fixed right-4 top-4 bottom-4 z-40 flex w-[22rem] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
      <div className="border-b border-border p-4">
        <div className="mb-2 flex items-start justify-between gap-2">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wide text-primary">Walkthrough</p>
            <h2 className="text-sm font-semibold leading-tight">{active.title}</h2>
          </div>
          <button onClick={() => g.stop()} aria-label="Close guide" className="rounded-md p-1 text-muted-foreground hover:bg-secondary"><X className="size-4" /></button>
        </div>
        {styleSwitcher}
      </div>

      {/* Step list */}
      <div className="border-b border-border px-2 py-2">
        <ol className="space-y-0.5">
          {active.steps.map((s, i) => {
            const done = g.isDone(active.slug, s.key);
            return (
              <li key={s.key}>
                <button
                  onClick={() => g.goTo(i)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition-colors",
                    i === stepIndex ? "bg-primary/10 font-medium text-foreground" : "text-muted-foreground hover:bg-secondary",
                  )}
                >
                  <span className={cn(
                    "flex size-5 shrink-0 items-center justify-center rounded-full border text-[11px]",
                    done ? "border-success bg-success text-success-foreground" : i === stepIndex ? "border-primary text-primary" : "border-border",
                  )}>
                    {done ? <Check className="size-3" /> : i + 1}
                  </span>
                  <span className="truncate">{s.title}</span>
                </button>
              </li>
            );
          })}
        </ol>
      </div>

      {/* Current step detail */}
      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Step {stepIndex + 1} of {total}</p>
          <h3 className="text-base font-semibold leading-snug">{step.title}</h3>
        </div>
        <div className="rounded-lg bg-secondary/50 p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Why it matters</p>
          <p className="mt-0.5 text-sm leading-relaxed">{step.why}</p>
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">What to do</p>
          <p className="mt-0.5 text-sm leading-relaxed">{step.how}</p>
        </div>
        {!onPage ? (
          <Button asChild className="w-full"><Link href={step.route}>Take me there <ArrowRight className="size-4" /></Link></Button>
        ) : (
          <div className="flex items-center gap-2 rounded-lg border border-success/40 bg-success/5 px-3 py-2 text-sm text-success">
            <CheckCircle2 className="size-4" /> You're on the right page.
          </div>
        )}
        {step.ask && (
          <Button variant="outline" className="w-full" onClick={() => askSage(step.ask!)}>
            <MessageSquare className="size-4" /> Ask Sage to help with this
          </Button>
        )}
      </div>

      {/* Footer nav */}
      <div className="flex items-center gap-2 border-t border-border p-3">
        <Button variant="ghost" size="sm" onClick={() => g.prev()} disabled={stepIndex === 0}><ChevronLeft className="size-4" /> Back</Button>
        <Button
          variant={g.isDone(active.slug, step.key) ? "outline" : "ghost"}
          size="sm"
          onClick={() => g.toggleDone(active.slug, step.key)}
        >
          <Check className="size-4" /> {g.isDone(active.slug, step.key) ? "Done" : "Mark done"}
        </Button>
        <Button size="sm" className="ml-auto" onClick={advance}>
          {stepIndex < total - 1 ? <>Next <ChevronRight className="size-4" /></> : <>Finish</>}
        </Button>
      </div>
    </div>
  );
}

/** Spotlight overlay that dims the page and points at the step's target control. */
function GuideTour({ onAdvance, styleSwitcher, onPage }: { onAdvance: () => void; styleSwitcher: React.ReactNode; onPage: boolean }) {
  const g = useGuide();
  const active = g.active!;
  const step = active.steps[g.stepIndex];
  const total = active.steps.length;
  const [rect, setRect] = useState<DOMRect | null>(null);
  const raf = useRef<number | null>(null);

  // Locate the target anchor for this step; retry briefly to catch late renders.
  useEffect(() => {
    setRect(null);
    if (!step.anchor || !onPage) return;
    let tries = 0;
    const find = () => {
      const el = document.querySelector(`[data-guide="${step.anchor}"]`);
      if (el) {
        el.scrollIntoView({ block: "center", behavior: "smooth" });
        setRect(el.getBoundingClientRect());
      } else if (tries++ < 20) {
        raf.current = window.setTimeout(find, 150) as unknown as number;
      }
    };
    find();
    const onMove = () => { const el = document.querySelector(`[data-guide="${step.anchor}"]`); if (el) setRect(el.getBoundingClientRect()); };
    window.addEventListener("scroll", onMove, true);
    window.addEventListener("resize", onMove);
    return () => {
      if (raf.current) clearTimeout(raf.current);
      window.removeEventListener("scroll", onMove, true);
      window.removeEventListener("resize", onMove);
    };
  }, [step.anchor, onPage, g.stepIndex]);

  const pad = 6;
  const box = rect ? { top: rect.top - pad, left: rect.left - pad, width: rect.width + pad * 2, height: rect.height + pad * 2 } : null;

  // Tooltip position: below the target if there's room, else centered.
  const tip = box
    ? { top: Math.min(box.top + box.height + 10, window.innerHeight - 260), left: Math.min(Math.max(box.left, 16), window.innerWidth - 360) }
    : null;

  return (
    <div className="fixed inset-0 z-40">
      {/* Dim layer with a cut-out around the target (four rects), or full dim. */}
      {box ? (
        <>
          <div className="absolute bg-black/50" style={{ top: 0, left: 0, right: 0, height: Math.max(0, box.top) }} />
          <div className="absolute bg-black/50" style={{ top: box.top + box.height, left: 0, right: 0, bottom: 0 }} />
          <div className="absolute bg-black/50" style={{ top: box.top, left: 0, width: Math.max(0, box.left), height: box.height }} />
          <div className="absolute bg-black/50" style={{ top: box.top, left: box.left + box.width, right: 0, height: box.height }} />
          <div className="pointer-events-none absolute rounded-lg ring-2 ring-primary ring-offset-2 ring-offset-transparent" style={{ top: box.top, left: box.left, width: box.width, height: box.height }} />
        </>
      ) : (
        <div className="absolute inset-0 bg-black/50" />
      )}

      {/* Tooltip card */}
      <div
        className="absolute w-[22rem] max-w-[calc(100vw-2rem)] rounded-2xl border border-border bg-card p-4 shadow-2xl"
        style={tip ? { top: tip.top, left: tip.left } : { top: "50%", left: "50%", transform: "translate(-50%,-50%)" }}
      >
        <div className="mb-2 flex items-start justify-between gap-2">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wide text-primary">{active.title} · {g.stepIndex + 1}/{total}</p>
            <h3 className="text-sm font-semibold leading-snug">{step.title}</h3>
          </div>
          <button onClick={() => g.stop()} aria-label="Close guide" className="rounded-md p-1 text-muted-foreground hover:bg-secondary"><X className="size-4" /></button>
        </div>
        <p className="mb-2 text-sm leading-relaxed">{step.how}</p>
        <p className="mb-3 text-xs leading-relaxed text-muted-foreground"><span className="font-semibold">Why:</span> {step.why}</p>
        {!onPage && (
          <Button asChild size="sm" className="mb-2 w-full"><Link href={step.route}>Take me to the page <ArrowRight className="size-4" /></Link></Button>
        )}
        {onPage && !rect && step.anchor && (
          <p className="mb-2 text-xs italic text-muted-foreground">Looking for the control on this page…</p>
        )}
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => g.prev()} disabled={g.stepIndex === 0}><ChevronLeft className="size-4" /></Button>
          <Button size="sm" onClick={onAdvance}>{g.stepIndex < total - 1 ? "Next" : "Finish"}</Button>
          <div className="ml-auto">{styleSwitcher}</div>
        </div>
      </div>
    </div>
  );
}
