import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { DOSEABLE_STATES, kindOf, lineRef, mgPerUnit, nextState, parseDose, round4, wholeUnits } from "@/lib/clinic-desk";
import { sameOriginOnly } from "../guard";

/**
 * Log a ketamine or Spravato dose from Clinic Desk: an "Administered" event on
 * each bottle it came from, a witnessed "Wasted" event for any remainder
 * discarded, and the bottle's running balance and state moved on — the same
 * records the Controlled Substances page writes when the dose is entered by
 * hand. Runs as the signed-in user (RLS applies; the DB stamps the company).
 *
 * No patient details are accepted (see parseDose): the events' patient
 * reference stays empty.
 *
 * Safe to retry. Each bottle line carries a reference Clinic Desk made for this
 * dose; a line already on record is reported, not written twice.
 */
const KIND_LABEL = { ketamine: "ketamine", spravato: "Spravato" } as const;
const STATE_LABEL: Record<string, string> = {
  received: "in receiving", in_primary_safe: "in stock in the safe", depleted: "used up", wasted: "wasted",
  destroyed: "destroyed", quarantined: "quarantined",
};

export async function POST(request: NextRequest) {
  const refused = sameOriginOnly(request);
  if (refused) return refused;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in to Compliance Hub." }, { status: 401 });

  const parsed = parseDose(await request.json().catch(() => null));
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const dose = parsed.dose;

  const { data: profile } = await supabase.from("profiles").select("full_name").eq("user_id", user.id).maybeSingle();
  const performer = String(profile?.full_name ?? "").trim() || user.email || "Clinic Desk user";

  const ids = dose.lines.map((l) => l.bottleId);
  const { data: rows, error: readErr } = await supabase.from("controlled_substance_items")
    .select("id, substance_name, container_label, strength, quantity_unit, current_quantity, state, custodian_name")
    .in("id", ids);
  if (readErr) return NextResponse.json({ error: "Your Compliance Hub role can't record controlled substances." }, { status: 403 });
  const byId = new Map((rows ?? []).map((r) => [r.id as string, r]));

  // Check every line before writing any of them, so a dose is never half-logged
  // because its second bottle was the wrong one.
  let mgCounted = 0, mgKnown = true;
  for (const l of dose.lines) {
    const r = byId.get(l.bottleId);
    const name = (r?.container_label as string) || "That bottle";
    if (!r) return NextResponse.json({ error: "A bottle wasn't found, or your role can't see it." }, { status: 404 });
    const kind = kindOf(r.substance_name as string);
    if (kind !== dose.kind) return NextResponse.json({ error: `${name} holds ${r.substance_name}, not ${KIND_LABEL[dose.kind]}.` }, { status: 400 });
    if (!(DOSEABLE_STATES as readonly string[]).includes(r.state as string)) {
      return NextResponse.json({ error: `${name} is ${STATE_LABEL[r.state as string] ?? r.state}. Check it out to a provider in Compliance Hub first.` }, { status: 409 });
    }
    const unit = (r.quantity_unit as string) || "units";
    if (wholeUnits(unit) && (!Number.isInteger(l.amount) || !Number.isInteger(l.waste))) {
      return NextResponse.json({ error: `${name} is counted in whole ${unit}.` }, { status: 400 });
    }
    const have = Number(r.current_quantity ?? 0);
    if (l.amount + l.waste > have + 1e-6) {
      return NextResponse.json({ error: `${name} shows ${round4(have)} ${unit} left, and this takes ${round4(l.amount + l.waste)}. Count the bottle in Compliance Hub before logging.` }, { status: 409 });
    }
    const per = mgPerUnit(unit, r.strength as string, kind);
    if (per == null) mgKnown = false; else mgCounted += l.amount * per;
  }
  // A unit mix-up (mg typed where the bottle counts mL) shows up here as a dose
  // that doesn't add up, and is refused rather than taken off the bottle.
  if (mgKnown && Math.abs(mgCounted - dose.doseMg) > 0.5) {
    return NextResponse.json({ error: `The amounts come to ${round4(mgCounted)} mg, but the dose is ${dose.doseMg} mg.` }, { status: 400 });
  }

  const results: { bottleId: string; label: string | null; balance: number; unit: string; state: string; already: boolean }[] = [];
  for (let i = 0; i < dose.lines.length; i++) {
    const l = dose.lines[i];
    const r = byId.get(l.bottleId)!;
    const tag = `[ref ${lineRef(dose.ref, i)}]`;
    const unit = (r.quantity_unit as string) || "units";

    const { data: prior } = await supabase.from("controlled_substance_events")
      .select("id").eq("item_id", l.bottleId).ilike("notes", `%${tag}%`).limit(1);
    if (prior && prior.length) {
      results.push({ bottleId: l.bottleId, label: (r.container_label as string) || null, balance: Number(r.current_quantity ?? 0), unit, state: r.state as string, already: true });
      continue;
    }

    const before = Number(r.current_quantity ?? 0);
    const afterGiven = round4(before - l.amount);
    const after = round4(afterGiven - l.waste);
    const state = nextState(after, l.waste > 0);

    // Claim the balance first, and only if nobody else moved it since it was
    // read: two doses from one bottle at once must not both start from the
    // same number.
    const { data: moved, error: moveErr } = await supabase.from("controlled_substance_items")
      .update({ current_quantity: after, state })
      .eq("id", l.bottleId).eq("current_quantity", before)
      .select("id");
    if (moveErr) return NextResponse.json({ error: `Couldn't update ${r.container_label ?? "the bottle"}: ${moveErr.message}`, logged: results }, { status: 500 });
    if (!moved || !moved.length) {
      return NextResponse.json({ error: `${r.container_label ?? "The bottle"}'s balance changed while this was being logged. Nothing more was recorded; try again.`, logged: results }, { status: 409 });
    }

    const common = {
      item_id: l.bottleId,
      event_date: dose.administeredAt,
      from_custodian_name: (r.custodian_name as string) || null,
      performed_by_name: performer,
      performed_by_user_id: user.id,
      patient_ref: null,
      discrepancy: false,
    };
    const events = [];
    if (l.amount > 0) {
      events.push({ ...common, event_type: "administer", quantity: l.amount, balance_after: afterGiven, witness_name: dose.witness,
        notes: `Logged from Clinic Desk · ${dose.doseMg} mg ${KIND_LABEL[dose.kind]} dose ${tag}` });
    }
    if (l.waste > 0) {
      events.push({ ...common, event_type: "waste", quantity: l.waste, balance_after: after, witness_name: dose.witness,
        notes: `Remainder wasted after a ${dose.doseMg} mg ${KIND_LABEL[dose.kind]} dose, logged from Clinic Desk ${tag}` });
    }
    const { error: evErr } = await supabase.from("controlled_substance_events").insert(events);
    if (evErr) {
      // Put the balance back so the bottle never shows a dose with no record of it.
      await supabase.from("controlled_substance_items").update({ current_quantity: before, state: r.state }).eq("id", l.bottleId).eq("current_quantity", after);
      return NextResponse.json({ error: `Couldn't record the dose on ${r.container_label ?? "the bottle"}: ${evErr.message}`, logged: results }, { status: 500 });
    }
    results.push({ bottleId: l.bottleId, label: (r.container_label as string) || null, balance: after, unit, state, already: false });
  }

  return NextResponse.json({ ok: true, performedBy: performer, lines: results });
}
