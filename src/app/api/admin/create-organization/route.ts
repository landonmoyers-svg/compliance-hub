import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatName } from "@/lib/format";

/**
 * Creates a new COMPANY (tenant) and invites its first owner.
 *
 * This is a PLATFORM-level action, deliberately above any single org's
 * owner/admin — the owner of company A must never be able to spin up company B.
 * Gated on profiles.platform_admin via is_platform_admin().
 *
 * Every row the new org gets is stamped with its org_id explicitly: this runs
 * as service_role, where auth.uid() is null, so the set_org_id() trigger cannot
 * derive the org on its own.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: isPlatformAdmin, error: gateErr } = await supabase.rpc("is_platform_admin");
  if (gateErr || isPlatformAdmin !== true) {
    return NextResponse.json({ error: "Forbidden — platform administrator access required." }, { status: 403 });
  }

  const body = await request.json() as { orgName?: string; ownerEmail?: string; ownerName?: string };
  const orgName = body.orgName?.trim();
  const ownerEmail = body.ownerEmail?.trim().toLowerCase();
  const ownerName = formatName(body.ownerName);
  if (!orgName || !ownerEmail || !ownerName) {
    return NextResponse.json({ error: "Company name, owner email, and owner name are all required." }, { status: 400 });
  }

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json(
      { error: "Not configured. Set SUPABASE_SERVICE_ROLE_KEY in the environment." },
      { status: 501 },
    );
  }

  // Refuse if this person already has a login — they'd end up spanning orgs in a
  // way the operator probably didn't intend. Add them via the org's own invite
  // flow instead.
  const { data: existingProfile } = await admin
    .from("profiles").select("user_id").eq("email", ownerEmail).maybeSingle();
  if (existingProfile) {
    return NextResponse.json(
      { error: "That email already has an account. Invite them from inside the target company instead." },
      { status: 409 },
    );
  }

  const slug = orgName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);

  // 1. The organization itself.
  const { data: org, error: orgErr } = await admin
    .from("organizations")
    .insert({ name: orgName, slug: slug || null, active: true })
    .select("id")
    .single();
  if (orgErr || !org) {
    return NextResponse.json({ error: `Couldn't create the company: ${orgErr?.message ?? "unknown error"}` }, { status: 500 });
  }
  const orgId = org.id as string;

  // 2. Invite the first owner.
  const PROD_APP_URL = "https://compliance-hub-lone-peak.vercel.app";
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || PROD_APP_URL;
  const { data: invited, error: inviteErr } = await admin.auth.admin.inviteUserByEmail(ownerEmail, {
    redirectTo: `${appUrl}/auth/reset`,
    data: { full_name: ownerName },
  });
  if (inviteErr || !invited?.user) {
    // Don't leave a half-built tenant behind.
    await admin.from("organizations").delete().eq("id", orgId);
    return NextResponse.json({ error: inviteErr?.message ?? "Failed to send the invitation." }, { status: 400 });
  }
  const ownerUserId = invited.user.id;

  // 3. Profile (a base row already exists from the handle_new_user trigger).
  const { error: profileErr } = await admin.from("profiles").upsert({
    user_id: ownerUserId,
    full_name: ownerName,
    email: ownerEmail,
    account_role: "owner",
    active: true,
    org_id: orgId,
  }, { onConflict: "user_id" });
  if (profileErr) {
    return NextResponse.json({ error: `Company created but profile setup failed: ${profileErr.message}` }, { status: 500 });
  }

  // 4. Membership — this is what actually grants the role, scoped to this org.
  const { error: memErr } = await admin.from("org_memberships").upsert({
    org_id: orgId,
    user_id: ownerUserId,
    account_role: "owner",
    all_locations: true,
    active: true,
  }, { onConflict: "org_id,user_id" });
  if (memErr) {
    return NextResponse.json({ error: `Company created but membership setup failed: ${memErr.message}` }, { status: 500 });
  }

  // 5. Minimum viable content so the new tenant isn't a broken shell.
  await admin.from("organization_settings").insert({ org_id: orgId, org_name: orgName });

  return NextResponse.json({ ok: true, orgId, ownerUserId, orgName });
}
