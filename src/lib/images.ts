"use client";

import exifr from "exifr";

export interface NormalizedImage {
  file: File;               // browser-renderable, AI-compatible image (JPEG if converted)
  capturedAt?: string;      // EXIF DateTimeOriginal (ISO)
  lat?: number;             // EXIF GPS latitude
  lng?: number;             // EXIF GPS longitude
  converted: boolean;       // true if HEIC/HEIF was converted to JPEG
}

function isHeic(file: File): boolean {
  return /image\/hei[cf]/i.test(file.type) || /\.(heic|heif)$/i.test(file.name);
}

/**
 * Prepare an uploaded photo for preview, AI vision, and storage:
 * - reads EXIF (capture time + GPS) from the ORIGINAL file (works for HEIC too),
 * - converts HEIC/HEIF to JPEG so it renders in <img> and is accepted by the
 *   vision model. Falls back to the original file if conversion fails.
 */
export async function normalizeImage(file: File): Promise<NormalizedImage> {
  let capturedAt: string | undefined;
  let lat: number | undefined;
  let lng: number | undefined;

  try {
    const [gps, meta] = await Promise.all([
      exifr.gps(file).catch(() => null),
      exifr.parse(file, ["DateTimeOriginal"]).catch(() => null),
    ]);
    if (gps && typeof gps.latitude === "number") { lat = gps.latitude; lng = gps.longitude; }
    if (meta?.DateTimeOriginal instanceof Date) capturedAt = meta.DateTimeOriginal.toISOString();
  } catch { /* no EXIF */ }

  if (!isHeic(file)) return { file, capturedAt, lat, lng, converted: false };

  try {
    const heic2any = (await import("heic2any")).default;
    const out = await heic2any({ blob: file, toType: "image/jpeg", quality: 0.85 });
    const blob = Array.isArray(out) ? out[0] : out;
    const name = file.name.replace(/\.(heic|heif)$/i, "") + ".jpg";
    const jpeg = new File([blob], name, { type: "image/jpeg" });
    return { file: jpeg, capturedAt, lat, lng, converted: true };
  } catch {
    return { file, capturedAt, lat, lng, converted: false };
  }
}
