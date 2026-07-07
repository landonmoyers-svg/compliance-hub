import type { WorkLocation } from "@/lib/data/schema";

/** Great-circle distance in meters between two lat/lng points. */
export function haversineMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6_371_000; // Earth radius in meters
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export interface LocationGuess {
  location: WorkLocation;
  distanceM: number;
}

/**
 * Guess which Work Location a photo was taken at, by finding the nearest
 * location (that has reference coordinates) to the photo's GPS. GPS resolves
 * the building, not the room — so this is a suggestion the user confirms.
 * Returns null if no location is within `maxMeters`.
 */
export function guessLocation(
  lat: number | undefined,
  lng: number | undefined,
  locations: WorkLocation[],
  maxMeters = 500,
): LocationGuess | null {
  if (lat == null || lng == null) return null;
  let best: LocationGuess | null = null;
  for (const l of locations) {
    if (l.lat == null || l.lng == null) continue;
    const distanceM = haversineMeters({ lat, lng }, { lat: l.lat, lng: l.lng });
    if (!best || distanceM < best.distanceM) best = { location: l, distanceM: Math.round(distanceM) };
  }
  return best && best.distanceM <= maxMeters ? best : null;
}
