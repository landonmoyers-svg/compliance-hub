import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

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
  const fullName = body.fullName?.trim();
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

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin;
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

  return NextResponse.json({ ok: true, userId: invited.user.id });
}
