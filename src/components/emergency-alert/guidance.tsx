"use client";

import type { EmergencySiteSettings, WorkLocation } from "@/lib/data/schema";
import { codeKind, connectedSites, equipmentPlan, mutualAidSites, type CodeKind } from "@/lib/emergency-alert/rules";
import { cn } from "@/lib/cn";

type Tone = "info" | "warn" | "danger" | "good";
interface Step { tone?: Tone; title: string; body: React.ReactNode }

const TONE: Record<Tone, string> = {
  info: "bg-primary text-primary-foreground",
  warn: "bg-warning text-black",
  danger: "bg-destructive text-destructive-foreground",
  good: "bg-success text-white",
};

/**
 * The step-by-step response for an incident, by code type — LP Alert's
 * guidance, with the site-specific parts (where the AED lives, who else is
 * exposed, standalone zones) read from the site settings instead of hard-coded.
 */
export function IncidentGuidance({ codeName, locationId, settings, locations }: {
  codeName: string;
  locationId: string | null | undefined;
  settings: EmergencySiteSettings[];
  locations: WorkLocation[];
}) {
  const kind = codeKind(codeName);
  const steps = stepsFor(kind, locationId, settings, locations);
  if (!steps.length) return null;
  const linked = connectedSites(locationId, settings).map((id) => locations.find((l) => l.id === id)?.name).filter(Boolean);

  return (
    <div className="rounded-lg border border-border">
      <div className="border-b border-border bg-secondary/60 px-3 py-2 text-sm font-semibold">{HEADINGS[kind]}</div>
      <ol className="space-y-2.5 p-3">
        {(kind === "armed" || kind === "fire") && linked.length > 0 && (
          <li className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs">
            ⚠️ {linked.join(" and ")} {linked.length > 1 ? "are" : "is"} physically connected — {kind === "fire" ? "both spaces may be affected" : "treat as linked risk areas"}.
          </li>
        )}
        {steps.map((s, i) => (
          <li key={i} className="flex gap-2.5 text-sm">
            <span className={cn("flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold", TONE[s.tone ?? "info"])}>{i + 1}</span>
            <div>
              <p className="font-semibold leading-tight">{s.title}</p>
              <p className="text-xs leading-relaxed text-muted-foreground">{s.body}</p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

const HEADINGS: Record<CodeKind, string> = {
  medical: "Medical emergency — what to do",
  armed: "Armed / active threat — what to do",
  behavioral: "Unarmed threat / behavioural crisis — what to do",
  fire: "Fire / smoke — what to do",
  other: "",
};

function stepsFor(kind: CodeKind, loc: string | null | undefined, settings: EmergencySiteSettings[], locations: WorkLocation[]): Step[] {
  const eq = equipmentPlan(loc, settings, locations);
  const standalone = !!settings.find((s) => s.locationId === loc) && mutualAidSites(loc, settings).length === 0;
  const meetAndDirect: Step = { title: "Assign a 911 meet-and-direct person", body: "One person waits at the main entrance to flag down emergency services and lead them straight to the scene." };

  switch (kind) {
    case "medical": {
      const out: Step[] = [
        { title: "Call 911 immediately", body: "Give the building name, address and exact room. Stay on the line and follow the dispatcher." },
        { title: "Begin BLS if trained", body: "Unresponsive and not breathing: start CPR and keep going until the AED arrives or EMS takes over." },
        meetAndDirect,
      ];
      if (eq.aed || eq.crashCart) {
        const here = [eq.aed?.onSite && "AED", eq.crashCart?.onSite && "crash cart"].filter(Boolean) as string[];
        const away = [eq.aed && !eq.aed.onSite && `AED from ${eq.aed.from}`, eq.crashCart && !eq.crashCart.onSite && `crash cart from ${eq.crashCart.from}`].filter(Boolean) as string[];
        out.push({
          tone: away.length ? "warn" : "good",
          title: away.length ? `Send someone for the ${away.join(" and ")}` : "AED & crash cart are on site",
          body: [here.length && `The ${here.join(" and ")} ${here.length > 1 ? "are" : "is"} here — bring ${here.length > 1 ? "them" : "it"} to the patient now.`, away.length && "Send someone now — don't wait."].filter(Boolean).join(" "),
        });
      }
      if (standalone) {
        out.push({ title: "This site responds in person", body: "Everyone available here responds directly. Other sites support remotely — they aren't expected to travel." });
      }
      return out;
    }
    case "behavioral":
      return [
        { title: "Stay calm — engage calmly", body: "Low, steady voice. No confrontational language or sudden moves. Don't physically intervene." },
        { title: "Offer supportive options", body: "A quiet space, water, time. Ask open questions to understand what they need." },
        { title: "Move uninvolved people away", body: "Quietly direct patients and staff out of the area without making the person feel surrounded or trapped." },
        { title: "Get a manager or admin", body: "Don't handle it alone — a second trained staff member should be present." },
        { tone: "warn", title: "Call 911 if it becomes unsafe", body: "Physically threatening, combative, or you feel unsafe: call 911 immediately." },
        { tone: "danger", title: "Escalate to the armed-threat code if a weapon appears", body: "If a weapon is produced or violence begins, trigger it immediately. Don't intervene physically." },
      ];
    case "armed":
      return [
        { tone: "danger", title: "Call 911 immediately", body: "Give the exact room/location of the threat. Stay on the line." },
        { tone: "danger", title: "RUN — HIDE — FIGHT", body: "RUN if there's a clear way out. HIDE if not — lock doors, silence phones, stay out of sight. FIGHT only as a last resort." },
        { tone: "danger", title: "Evacuate or shelter as directed", body: "Follow the directive an admin sets on this page. Lock doors, silence phones, keep away from windows and corridors." },
        { ...meetAndDirect, tone: "danger", body: "Once it's safe, one person guides emergency services in from the entrance." },
      ];
    case "fire":
      return [
        { tone: "danger", title: "Evacuate immediately", body: "Pull the nearest alarm if it isn't sounding. Guide everyone to the nearest exit. Don't use elevators." },
        { tone: "danger", title: "Call 911 — confirm address and floor", body: "Say which area has fire or smoke. Stay on the line." },
        { tone: "warn", title: "Go to the rally point", body: "Outdoor assembly area, clear of emergency-vehicle lanes. Don't re-enter until the fire department clears it." },
        { ...meetAndDirect, tone: "warn" },
        { tone: "warn", title: "Headcount", body: "The site lead accounts for all staff and patients at the rally point and reports anyone missing to 911." },
        { tone: "warn", title: "Extinguisher — trained staff only (PASS)", body: "Only if small and contained with a clear exit behind you: Pull, Aim at the base, Squeeze, Sweep. If it grows, get out." },
      ];
    default:
      return [];
  }
}
