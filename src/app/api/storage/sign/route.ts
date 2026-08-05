import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Mints a short-lived signed URL for an object in the private `documents`
 * bucket — but ONLY after authorizing the caller against the owning record.
 *
 * Why server-side: signed-URL minting used to run in the browser, so the flat
 * storage RLS policy was the only gate and any authenticated user could reach
 * any file. Here we (1) require a session, (2) call can_view_object() which
 * re-applies the caller's RLS (true only if they can see the object directly or
 * a record they may read references it), then (3) mint with the service-role
 * key. Direct client access is separately locked to owner-or-privileged.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json().catch(() => null)) as
    | { path?: string; expiresIn?: number }
    | null;
  const path = body?.path;
  if (!path || typeof path !== "string" || /^https?:\/\//i.test(path) || path.includes("..")) {
    return NextResponse.json({ error: "Invalid path" }, { status: 400 });
  }
  // Clamp lifetime to a sane window (30s–1h).
  const expiresIn = Math.min(Math.max(Number(body?.expiresIn) || 120, 30), 3600);

  // Authorize against the owning record (RLS-scoped).
  const { data: allowed, error: authzError } = await supabase.rpc("can_view_object", { p: path });
  if (authzError || allowed !== true) {
    return NextResponse.json({ error: "Not authorized for this file" }, { status: 403 });
  }

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "Storage not configured" }, { status: 500 });

  const { data, error } = await admin.storage.from("documents").createSignedUrl(path, expiresIn);
  if (error || !data) return NextResponse.json({ error: "Could not sign URL" }, { status: 500 });

  return NextResponse.json({ signedUrl: data.signedUrl });
}
