"use client";

/**
 * Live plumbing for Emergency Alert: row changes pushed from the database, who
 * is online right now, and the org id that names our private channels.
 *
 * Realtime is the fast path; a slow poll is the safety net. A dropped socket
 * (laptop sleep, flaky Wi-Fi) must never mean a missed alarm, so the active-
 * incident queries also refetch on an interval and when the tab regains focus.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth/context";

let client: ReturnType<typeof createClient> | null = null;
export function supabase() {
  if (!client) client = createClient();
  return client;
}

/** The organization the signed-in person belongs to (single active membership). */
export function useOrgId(): string | null {
  const { user } = useAuth();
  const q = useQuery({
    queryKey: ["myOrgId", user?.id],
    enabled: !!user?.id,
    staleTime: Infinity,
    queryFn: async () => {
      const { data } = await supabase()
        .from("org_memberships")
        .select("org_id")
        .eq("user_id", user!.id)
        .eq("active", true)
        .limit(1)
        .maybeSingle();
      return (data?.org_id as string | undefined) ?? null;
    },
  });
  return q.data ?? null;
}

const LIVE_TABLES = [
  ["emergency_incidents", "emergencyIncidents"],
  ["emergency_responses", "emergencyResponses"],
  ["assistance_requests", "assistanceRequests"],
] as const;

/** Poll interval behind the realtime stream. */
const SAFETY_POLL_MS = 20_000;

/**
 * Keep the emergency collections fresh. Mount once, high in the tree (the app
 * shell does), so every page and the alarm overlay share one subscription.
 */
export function useEmergencyLive(enabled: boolean) {
  const qc = useQueryClient();
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    const sb = supabase();
    const refresh = (key: string) => void qc.invalidateQueries({ queryKey: [key] });
    const channel = sb.channel("emergency-rows");
    for (const [table, key] of LIVE_TABLES) {
      channel.on("postgres_changes", { event: "*", schema: "public", table }, () => refresh(key));
    }
    channel.subscribe((status) => setConnected(status === "SUBSCRIBED"));

    const poll = setInterval(() => LIVE_TABLES.forEach(([, key]) => refresh(key)), SAFETY_POLL_MS);
    const onFocus = () => LIVE_TABLES.forEach(([, key]) => refresh(key));
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      clearInterval(poll);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
      void sb.removeChannel(channel);
    };
  }, [enabled, qc]);

  return connected;
}

export interface OnlinePerson {
  userId: string;
  name: string;
  /** Where they are today (location id or "remote"), if known. */
  locationId: string | null;
  isAdmin: boolean;
  onlineAt: string;
}

/**
 * Who has the Hub open right now, via Realtime Presence on a private org
 * channel — replaces LP Alert's "lastSeen every 60 s" database writes.
 */
export function usePresence(orgId: string | null, me: Omit<OnlinePerson, "onlineAt"> | null): OnlinePerson[] {
  const [people, setPeople] = useState<OnlinePerson[]>([]);
  const meRef = useRef(me);
  useEffect(() => { meRef.current = me; }, [me]);
  const trackKey = me ? `${me.userId}|${me.locationId}|${me.isAdmin}` : "";

  useEffect(() => {
    if (!orgId || !meRef.current) return;
    const sb = supabase();
    let cancelled = false;
    const channel = sb.channel(`org:${orgId}:presence`, {
      config: { private: true, presence: { key: meRef.current.userId } },
    });
    channel.on("presence", { event: "sync" }, () => {
      const state = channel.presenceState<OnlinePerson>();
      const list = Object.values(state).map((metas) => metas[0]).filter(Boolean) as OnlinePerson[];
      setPeople(list);
    });
    void (async () => {
      await sb.realtime.setAuth();
      if (cancelled) return;
      channel.subscribe(async (status) => {
        if (status === "SUBSCRIBED" && meRef.current) {
          await channel.track({ ...meRef.current, onlineAt: new Date().toISOString() });
        }
      });
    })();
    return () => {
      cancelled = true;
      void sb.removeChannel(channel);
    };
    // Re-track when my location changes.
  }, [orgId, trackKey]);

  return useMemo(() => [...people].sort((a, b) => a.name.localeCompare(b.name)), [people]);
}
