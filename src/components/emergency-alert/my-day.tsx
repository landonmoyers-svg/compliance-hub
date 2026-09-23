"use client";

import { useState } from "react";
import { MapPin, Bell, BellOff, Shield } from "lucide-react";
import { toast } from "sonner";
import { useCreate, useUpdate } from "@/lib/data/hooks";
import { useAuth } from "@/lib/auth/context";
import { isClockedInToday, todayISO } from "@/lib/emergency-alert/rules";
import { enableAlertsOnThisDevice } from "@/lib/emergency-alert/push-client";
import { unlockAudio, playAlarm, inNativeApp } from "@/lib/emergency-alert/sounds";
import type { EmergencyData } from "@/lib/emergency-alert/use-emergency";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

/** Where I am today (drives who's expected to respond where), my assignments there, and alert permission. */
export function MyDay({ data }: { data: EmergencyData }) {
  const { user } = useAuth();
  const create = useCreate("emergencyResponderProfiles");
  const update = useUpdate("emergencyResponderProfiles");
  const p = data.myProfile;
  const here = data.myLocationId;
  const overridden = isClockedInToday(p);
  const [perm, setPerm] = useState<NotificationPermission | "unsupported">(() => (inNativeApp() ? "granted" : typeof Notification === "undefined" ? "unsupported" : Notification.permission));

  const setToday = async (loc: string) => {
    if (!user) return;
    try {
      if (p) await update.mutateAsync({ id: p.id, patch: { clockedInLocationId: loc || null, clockedInDate: loc ? todayISO() : null } });
      else await create.mutateAsync({
        userId: user.id, fullName: user.fullName, clockedInLocationId: loc, clockedInDate: todayISO(),
        weeklySchedule: {}, codeDefaults: {}, canListenAudio: false, showInContacts: true,
      });
      toast.success(loc ? `You're at ${data.locationName(loc)} today.` : "Back to your usual schedule.");
    } catch (e) {
      toast.error(`Couldn't save: ${e instanceof Error ? e.message : "error"}`);
    }
  };

  const enable = async () => {
    unlockAudio();
    const r = await enableAlertsOnThisDevice();
    setPerm(r === "unsupported" ? "unsupported" : r);
    if (r === "granted") { playAlarm("triple_beep"); toast.success("Alerts are on for this device — that was the test tone."); }
    else if (r === "denied") toast.error("Notifications are blocked in this browser's settings. The in-app alarm still works while the Hub is open.");
  };

  const roles = data.locationRoles.filter((r) => r.userId === user?.id && r.locationId === here);

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Today you&apos;re at</p>
          {overridden && <Badge variant="warning">Changed for today</Badge>}
        </div>
        <div className="flex items-center gap-2">
          <MapPin className="size-4 text-primary" />
          <select aria-label="Where you are today" className="flex-1 rounded-md border border-border bg-background px-2 py-1.5 text-sm font-medium"
            value={here ?? ""} onChange={(e) => void setToday(e.target.value)}>
            <option value="" disabled>Not set</option>
            {data.locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            <option value="remote">Remote</option>
          </select>
        </div>
        {overridden && (
          <button onClick={() => void setToday("")} className="text-xs text-primary hover:underline">Use my usual schedule</button>
        )}

        {roles.length > 0 && (
          <div className="space-y-1.5 border-t border-border pt-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Your assignments here</p>
            {roles.map((r) => (
              <p key={r.id} className="flex items-start gap-2 text-sm">
                <Shield className="mt-0.5 size-3.5 shrink-0 text-primary" />
                <span><strong>{r.codeName}:</strong> {r.responseRole}{r.expectedAssistance ? ` — ${r.expectedAssistance}` : ""}</span>
              </p>
            ))}
          </div>
        )}

        <div className="border-t border-border pt-3">
          {perm === "granted" ? (
            <p className="flex items-center gap-2 text-sm text-success"><Bell className="size-4" /> Alerts on for this device
              <button onClick={() => { unlockAudio(); playAlarm("triple_beep"); }} className="ml-auto text-xs text-primary hover:underline">Test sound</button></p>
          ) : (
            <Button variant="outline" size="sm" className="w-full" onClick={() => void enable()}>
              <BellOff /> Turn on alerts for this device
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
