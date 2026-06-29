"use client";

import { createClient } from "@/lib/supabase/client";

const BUCKET = "documents";

/**
 * Upload a file to the shared `documents` storage bucket and return its public URL.
 * Files are namespaced by a folder prefix (e.g. "sop", "employee-vault") so the
 * bucket stays organized. Throws on failure so callers can surface an error toast.
 */
export async function uploadFile(file: File, folder: string): Promise<string> {
  const supabase = createClient();
  const ext = file.name.includes(".") ? file.name.split(".").pop() : "bin";
  // Avoid Math.random/Date.now collisions by combining time + name + size.
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 60);
  const path = `${folder}/${Date.now()}-${file.size}-${safeName}.${ext}`;

  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    cacheControl: "3600",
    upsert: false,
    contentType: file.type || undefined,
  });
  if (error) throw new Error(error.message);

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}
