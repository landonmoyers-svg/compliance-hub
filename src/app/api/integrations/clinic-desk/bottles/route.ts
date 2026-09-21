import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { DOSEABLE_STATES, kindOf, mgPerUnit, wholeUnits } from "@/lib/clinic-desk";
import { sameOriginOnly } from "../guard";

/**
 * The ketamine and Spravato bottles a dose can be given from — checked out to a
 * provider, or already open — for Clinic Desk's dose card. Runs as the signed-in
 * user, so it sees exactly what the Controlled Substances page shows them and no
 * more (privileged roles only, their company, their sites). Carries no patient
 * data because the tracker holds none.
 */
export async function GET(request: NextRequest) {
  const refused = sameOriginOnly(request);
  if (refused) return refused;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in to Compliance Hub." }, { status: 401 });

  const [profileQ, itemsQ, staffQ, locQ] = await Promise.all([
    supabase.from("profiles").select("full_name").eq("user_id", user.id).maybeSingle(),
    supabase.from("controlled_substance_items")
      .select("id, substance_name, container_label, strength, quantity_unit, current_quantity, state, custodian_name, custodian_user_id, location_id, lot_number, expiration_date")
      .in("state", [...DOSEABLE_STATES])
      .order("container_label", { ascending: true })
      .limit(500),
    supabase.from("employees").select("first_name, last_name, employment_status").eq("employment_status", "active").limit(500),
    supabase.from("locations").select("id, name").limit(200),
  ]);
  if (itemsQ.error) {
    // RLS hides the table from roles that may not see controlled substances;
    // say that, rather than showing an empty list that looks like "no bottles".
    return NextResponse.json({ error: "Your Compliance Hub role can't see controlled substances.", detail: itemsQ.error.message }, { status: 403 });
  }

  const me = String(profileQ.data?.full_name ?? "").trim();
  const norm = (s: unknown) => String(s ?? "").toLowerCase().replace(/[^a-z]/g, "");
  const places = new Map((locQ.data ?? []).map((l) => [l.id as string, l.name as string]));

  const bottles = (itemsQ.data ?? [])
    .map((r) => {
      const kind = kindOf(r.substance_name as string);
      return {
        id: r.id as string,
        label: (r.container_label as string) || null,
        substance: r.substance_name as string,
        kind,
        strength: (r.strength as string) || null,
        unit: (r.quantity_unit as string) || "units",
        balance: Number(r.current_quantity ?? 0),
        state: r.state as string,
        custodian: (r.custodian_name as string) || null,
        mine: r.custodian_user_id === user.id || (!!me && norm(r.custodian_name) === norm(me)),
        location: places.get(r.location_id as string) ?? null,
        lot: (r.lot_number as string) || null,
        expires: (r.expiration_date as string) || null,
        mgPerUnit: mgPerUnit(r.quantity_unit as string, r.strength as string, kind),
        whole: wholeUnits(r.quantity_unit as string),
      };
    })
    .filter((b) => b.kind !== "other" && b.balance > 0);

  const staff = [...new Set((staffQ.data ?? [])
    .map((e) => `${String(e.first_name ?? "").trim()} ${String(e.last_name ?? "").trim()}`.trim())
    .filter(Boolean))].sort();

  return NextResponse.json({ user: { name: me || user.email || "You" }, bottles, staff });
}
