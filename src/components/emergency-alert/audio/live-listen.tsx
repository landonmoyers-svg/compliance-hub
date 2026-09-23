"use client";

import { useEffect, useRef, useState } from "react";
import { Headphones, VolumeX } from "lucide-react";
import type { EmergencyIncident } from "@/lib/data/schema";
import { db } from "@/lib/data";
import { useAuth } from "@/lib/auth/context";
import { useLiveFeeds, useReceiverStatus } from "@/lib/emergency-alert/audio/live-store";
import { deviceLabel } from "@/lib/emergency-alert/audio/clip-store";
import { Button } from "@/components/ui/button";

/**
 * "Listen live" for an admin device. Silent until pressed (the admin may be in
 * a room with patients), and every listen is written to the audio audit log.
 */
export function LiveListen({ incident }: { incident: EmergencyIncident }) {
  const { user } = useAuth();
  const status = useReceiverStatus();
  const feed = useLiveFeeds().find((f) => f.incidentId === incident.id);
  const [on, setOn] = useState(false);
  const el = useRef<HTMLAudioElement | null>(null);

  const playing = on && !!feed;
  useEffect(() => {
    if (!el.current) return;
    el.current.srcObject = playing ? feed!.stream : null;
    if (playing) void el.current.play().catch(() => setOn(false));
  }, [playing, feed]);

  if (status !== "ready") return null;
  if (!feed) return <span className="text-xs text-muted-foreground">· live audio not connected</span>;

  const toggle = () => {
    const next = !playing;
    setOn(next);
    if (next && user) {
      void db().emergencyAudioLog.create({
        incidentId: incident.id, incidentLabel: `${incident.codeName} — ${incident.locationName ?? "remote"}`, action: "listened_live",
        performedBy: user.id, performedByName: user.fullName, performedByEmail: user.email, deviceLabel: deviceLabel(),
      }).catch(() => {});
    }
  };

  return (
    <>
      <audio ref={el} className="hidden" />
      <Button size="sm" variant={playing ? "destructive" : "outline"} onClick={toggle} className="ml-auto">
        {playing ? <><VolumeX /> Stop listening</> : <><Headphones /> Listen live</>}
      </Button>
    </>
  );
}
