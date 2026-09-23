"use client";

import { useMemo } from "react";
import { useCollection } from "@/lib/data/hooks";
import { useAuth } from "@/lib/auth/context";
import { effectiveLocationId } from "./rules";

/** Everything the emergency screens read, with the derived views they share. */
export function useEmergencyData() {
  const { user } = useAuth();
  const codesQ = useCollection("emergencyCodes");
  const incidentsQ = useCollection("emergencyIncidents");
  const responsesQ = useCollection("emergencyResponses");
  const assistanceQ = useCollection("assistanceRequests");
  const profilesQ = useCollection("emergencyResponderProfiles");
  const settingsQ = useCollection("emergencySiteSettings");
  const rolesQ = useCollection("emergencyLocationRoles");
  const locationsQ = useCollection("locations");

  return useMemo(() => {
    const codes = (codesQ.data ?? []).filter((c) => c.active).sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
    const incidents = [...(incidentsQ.data ?? [])].sort((a, b) => b.triggeredAt.localeCompare(a.triggeredAt));
    const active = incidents.filter((i) => !i.resolved);
    const responses = responsesQ.data ?? [];
    const assistance = [...(assistanceQ.data ?? [])].sort((a, b) => b.createdDate.localeCompare(a.createdDate));
    const openAssistance = assistance.filter((a) => !a.resolved);
    const profiles = profilesQ.data ?? [];
    const myProfile = profiles.find((p) => p.userId === user?.id) ?? null;
    const locations = (locationsQ.data ?? []).filter((l) => l.active !== false);
    return {
      loading: codesQ.isLoading || incidentsQ.isLoading || locationsQ.isLoading,
      error: codesQ.error ?? incidentsQ.error ?? null,
      codes,
      allCodes: codesQ.data ?? [],
      incidents,
      active,
      responses,
      responsesFor: (incidentId: string) => responses.filter((r) => r.incidentId === incidentId).sort((a, b) => a.respondedAt.localeCompare(b.respondedAt)),
      assistance,
      openAssistance,
      profiles,
      myProfile,
      myLocationId: effectiveLocationId(myProfile),
      settings: settingsQ.data ?? [],
      locationRoles: rolesQ.data ?? [],
      locations,
      locationName: (id: string | null | undefined) =>
        id === "remote" ? "Remote" : locations.find((l) => l.id === id)?.name ?? null,
    };
  }, [user?.id, codesQ.data, codesQ.isLoading, codesQ.error, incidentsQ.data, incidentsQ.isLoading, incidentsQ.error,
      responsesQ.data, assistanceQ.data, profilesQ.data, settingsQ.data, rolesQ.data, locationsQ.data, locationsQ.isLoading]);
}

export type EmergencyData = ReturnType<typeof useEmergencyData>;
