import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatName } from "@/lib/format";

const PRIVILEGED = ["owner", "admin", "hr", "clinical_leadership"];

export async function POST(request: NextRequest) {
  // 1. Authenticate the caller and confirm they're privileged.
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: caller } = await supabase
    .from("profiles")
    .select("account_role")
    .eq("user_id", user.id)
    .single();
  if (!caller || !PRIVILEGED.includes(caller.account_role)) {
    return NextResponse.json({ error: "Forbidden — admin access required." }, { status: 403 });
  }

  // 2. Validate input.
  const body = await request.json() as {
    email?: string; fullName?: string; accountRole?: string;
    staffRole?: string; department?: string;
  };
  const email = body.email?.trim().toLowerCase();
  const fullName = formatName(body.fullName);
  if (!email || !fullName) {
    return NextResponse.json({ error: "Email and full name are required." }, { status: 400 });
  }
  // Only an owner may mint another owner.
  const requestedRole = body.accountRole ?? "staff";
  if (requestedRole === "owner" && caller.account_role !== "owner") {
    return NextResponse.json({ error: "Only an owner can create another owner." }, { status: 403 });
  }

  // 3. Provision via the service-role admin client.
  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json(
      { error: "User provisioning isn't configured. Set SUPABASE_SERVICE_ROLE_KEY in the environment." },
      { status: 501 },
    );
  }

  // The invite email's "set password" link is built from appUrl. NEVER derive it
  // from the request origin: an admin browsing a preview/branch/deployment URL
  // (e.g. *-git-main-*.vercel.app) would bake that host into the link, and those
  // hosts sit behind Vercel Deployment Protection — the invitee then hits Vercel's
  // "log in to Vercel" wall instead of our login. Pin to the public production URL.
  const PROD_APP_URL = "https://compliance-hub-lone-peak.vercel.app";
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || PROD_APP_URL;
  const { data: invited, error: inviteErr } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${appUrl}/auth/reset`,
  });
  if (inviteErr || !invited?.user) {
    return NextResponse.json(
      { error: inviteErr?.message ?? "Failed to send invitation." },
      { status: 400 },
    );
  }

  // 4. Link the profile with the REAL auth user id and the requested role.
  //    A DB trigger (handle_new_user) already created a base profile row (role
  //    'staff') the moment inviteUserByEmail created the auth user, so UPSERT on
  //    user_id — a plain insert would collide with that row (user_id is unique)
  //    and the chosen role would be silently dropped.
  const { error: profileErr } = await admin.from("profiles").upsert({
    user_id: invited.user.id,
    full_name: fullName,
    email,
    account_role: requestedRole,
    staff_role: body.staffRole?.trim() || null,
    department: body.department?.trim() || null,
    active: true,
  }, { onConflict: "user_id" });
  if (profileErr) {
    return NextResponse.json({ error: `Invite sent but profile setup failed: ${profileErr.message}` }, { status: 500 });
  }

  // 5. Auto-link this person's existing records that were filed by NAME before
  //    they had a login, so their My Portal shows them immediately (and RLS
  //    own-row access works). ilike without wildcards = case-insensitive equals.
  const newUserId = invited.user.id;
  await admin.from("credentials").update({ employee_user_id: newUserId }).is("employee_user_id", null).ilike("employee_name", fullName);
  await admin.from("insurance_policies").update({ holder_user_id: newUserId }).is("holder_user_id", null).ilike("holder_name", fullName);
  // Employees match on first+last, so find the unlinked record by full name.
  const { data: emps } = await admin.from("employees").select("id, first_name, last_name, user_id");
  const emp = (emps ?? []).find((e) => !e.user_id && `${e.first_name ?? ""} ${e.last_name ?? ""}`.trim().toLowerCase() === fullName.toLowerCase());
  if (emp) await admin.from("employees").update({ user_id: newUserId }).eq("id", emp.id);

  return NextResponse.json({ ok: true, userId: newUserId });
}
