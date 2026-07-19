import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Record a read-type access event — a page view, a document open, an export.
 * The actor is taken from the authenticated session, never the request body, so
 * entries can't be spoofed; and the client may only log READ-type actions
 * (create/update/delete are recorded server-side by DB triggers). Feeds the
 * Audit Trail, mirroring HIPAA Security-Rule audit controls (§164.312(b)).
 */
const READ_ACTIONS = new Set(["view", "export", "acknowledge", "sign"]);
const RISKS = new Set(["low", "medium", "high", "critical"]);

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => ({})) as {
    action?: string; entityType?: string; entityId?: string; entityLabel?: string; details?: string; riskLevel?: string;
  };
  const action = READ_ACTIONS.has(body.action ?? "") ? body.action! : "view";
  const riskLevel = RISKS.has(body.riskLevel ?? "") ? body.riskLevel! : "medium";

  const { data: profile } = await supabase
    .from("profiles").select("full_name, email").eq("user_id", user.id).single();

  const { error } = await supabase.from("audit_logs").insert({
    actor_name: profile?.full_name ?? user.email ?? "Unknown",
    actor_email: profile?.email ?? user.email ?? null,
    action,
    entity_type: body.entityType ?? "page",
    entity_id: body.entityId ?? null,
    entity_label: body.entityLabel ?? null,
    details: body.details ?? null,
    risk_level: riskLevel,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
