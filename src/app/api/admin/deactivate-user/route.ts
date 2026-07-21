import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const PRIVILEGED = ["owner", "admin", "hr", "clinical_leadership"];

/**
 * Offboarding: revoke a person's app access. Sets their profile to inactive so
 * canAccessPath()/is_privileged() deny everything, and (best-effort) bans the
 * auth user so their session can't be used. Privileged callers only; an owner
 * can't be deactivated except by another owner (never self).
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: caller } = await supabase.from("profiles").select("account_role").eq("user_id", user.id).single();
  if (!caller || !PRIVILEGED.includes(caller.account_role)) {
    return NextResponse.json({ error: "Forbidden — admin access required." }, { status: 403 });
  }

  const { userId } = await request.json() as { userId?: string };
  if (!userId) return NextResponse.json({ error: "userId is required." }, { status: 400 });
  if (userId === user.id) return NextResponse.json({ error: "You can't deactivate your own account." }, { status: 400 });

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "Not configured (SUPABASE_SERVICE_ROLE_KEY missing)." }, { status: 501 });

  const { data: target } = await admin.from("profiles").select("account_role, full_name, active").eq("user_id", userId).single();
  if (!target) return NextResponse.json({ error: "No linked account found for this person." }, { status: 404 });
  if (target.account_role === "owner" && caller.account_role !== "owner") {
    return NextResponse.json({ error: "Only an owner can deactivate an owner." }, { status: 403 });
  }

  const { error } = await admin.from("profiles").update({ active: false, account_role: "inactive" }).eq("user_id", userId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Best-effort: invalidate the auth session so an active session can't linger.
  try { await admin.auth.admin.updateUserById(userId, { ban_duration: "876000h" }); } catch { /* profile-inactive is the enforcing gate */ }

  return NextResponse.json({ ok: true });
}
