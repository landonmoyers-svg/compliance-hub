"use client";

import { useCallback, useSyncExternalStore } from "react";
import { ShieldCheck, Sparkles, Check, AlertTriangle } from "lucide-react";
import { Card, Badge } from "./ui";
import {
  SECURITY_MODES,
  DEFAULT_SECURITY_MODE,
  type SecurityMode,
} from "@/lib/ingest/security-mode";

/**
 * Choosing how much help a household wants from a model.
 *
 * Presented as a genuine choice rather than an upsell: each option lists what it
 * costs as plainly as what it gives, and neither is marked "recommended". A
 * household that wants nothing to leave their machine is not making a mistake,
 * and one that wants the sorting done for them is not being reckless.
 *
 * The word "anonymised" appears nowhere, because it would be false. Redaction
 * removes identifiers; context can still narrow down who a document belongs to.
 */

const STORAGE_KEY = "homevault:security-mode";
const listeners = new Set<() => void>();

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

const read = (): SecurityMode =>
  (localStorage.getItem(STORAGE_KEY) as SecurityMode | null) ?? DEFAULT_SECURITY_MODE;
/** The server can't know the choice, and must not guess a weaker one. */
const readOnServer = (): SecurityMode => DEFAULT_SECURITY_MODE;

export function useSecurityMode() {
  const mode = useSyncExternalStore(subscribe, read, readOnServer);

  const choose = useCallback((next: SecurityMode) => {
    localStorage.setItem(STORAGE_KEY, next);
    for (const l of listeners) l();
  }, []);

  return { mode, choose };
}

export function SecurityModePicker() {
  const { mode, choose } = useSecurityMode();

  return (
    <Card className="p-5">
      <div className="flex items-start gap-3">
        <ShieldCheck className="mt-0.5 shrink-0 text-accent" size={18} />
        <div>
          <h2 className="font-semibold">How documents get sorted</h2>
          <p className="mt-1 text-sm text-muted">
            Your records are encrypted on this device either way. This is only about whether an AI model is
            allowed to help identify documents that this device can&apos;t place on its own.
          </p>
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {SECURITY_MODES.map((option) => {
          const active = option.key === mode;
          return (
            <button
              key={option.key}
              onClick={() => choose(option.key)}
              className={`rounded-xl border p-4 text-left transition-colors hover:border-accent/40 ${
                active ? "border-accent/50 bg-surface-2" : "border-border bg-surface"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2 font-medium">
                  {option.key === "private" ? <ShieldCheck size={15} /> : <Sparkles size={15} />}
                  {option.label}
                </span>
                {active ? <Badge tone="accent">on</Badge> : null}
              </div>

              <p className="mt-2 text-sm text-muted">{option.summary}</p>

              <ul className="mt-3 flex flex-col gap-1">
                {option.benefits.map((b) => (
                  <li key={b} className="flex items-start gap-1.5 text-xs text-muted">
                    <Check size={12} className="mt-0.5 shrink-0 text-success" />
                    {b}
                  </li>
                ))}
              </ul>

              {/* Costs are shown at the same weight as benefits. An option whose
                  downsides you have to go looking for isn't a real choice. */}
              <ul className="mt-2 flex flex-col gap-1 border-t border-border pt-2">
                {option.costs.map((c) => (
                  <li key={c} className="flex items-start gap-1.5 text-xs text-muted">
                    <AlertTriangle size={12} className="mt-0.5 shrink-0 text-warning" />
                    {c}
                  </li>
                ))}
              </ul>
            </button>
          );
        })}
      </div>

      <p className="mt-3 text-xs text-muted">
        Either way, identity documents and estate paperwork — passports, Social Security cards, wills — are
        never sent anywhere. You can change this whenever you like; it only affects documents added afterwards.
      </p>
    </Card>
  );
}
