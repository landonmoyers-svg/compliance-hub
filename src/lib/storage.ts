"use client";

import { createClient } from "@/lib/supabase/client";

const BUCKET = "documents";

/**
 * Upload a file to the private `documents` bucket and return its object PATH
 * (not a public URL — the bucket is private). Store the path on the record;
 * render it with <FileLink> which mints a short-lived signed URL on demand.
 */
export async function uploadFile(file: File, folder: string): Promise<string> {
  const supabase = createClient();
  const ext = file.name.includes(".") ? file.name.split(".").pop() : "bin";
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 60);
  const path = `${folder}/${Date.now()}-${file.size}-${safeName}.${ext}`;

  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    cacheControl: "3600",
    upsert: false,
    contentType: file.type || undefined,
  });
  if (error) throw new Error(error.message);
  return path;
}

/**
 * Mint a short-lived signed URL for a stored object path. If the value is a
 * legacy full URL (from before the bucket was private), it is returned as-is.
 */
export async function getSignedUrl(pathOrUrl: string, expiresInSeconds = 120): Promise<string | null> {
  if (!pathOrUrl) return null;
  if (/^https?:\/\//.test(pathOrUrl)) return pathOrUrl; // legacy public URL
  const supabase = createClient();
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(pathOrUrl, expiresInSeconds);
  if (error || !data) return null;
  return data.signedUrl;
}
