import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Record that a user OPENED a restricted record (e.g. a protected personnel
 * document). The actor is taken from the authenticated session — never from the
 * request body — so the audit entry can't be spoofed. Feeds the Audit Trail,
 * mirroring HIPAA Security-Rule audit controls (§164.312(b)).
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => ({})) as {
    entityType?: string; entityId?: string; entityLabel?: string; details?: string;
  };

  const { data: profile } = await supabase
    .from("profiles").select("full_name, email").eq("user_id", user.id).single();

  const { error } = await supabase.from("audit_logs").insert({
    actor_name: profile?.full_name ?? user.email ?? "Unknown",
    actor_email: profile?.email ?? user.email ?? null,
    action: "view",
    entity_type: body.entityType ?? "employee_documents",
    entity_id: body.entityId ?? null,
    entity_label: body.entityLabel ?? null,
    details: body.details ?? "Opened a restricted document",
    risk_level: "medium",
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
