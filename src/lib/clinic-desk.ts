// Clinic Desk → Compliance Hub: logging a ketamine or Spravato dose against a
// bottle in the controlled-substance tracker, from the desktop app Landon
// charts in (his ask, 2026-09-21: "when a dose of ketamine or spravato is
// logged it can log it in the tracker on compliance hub").
//
// The boundary is the point of this file. Clinic Desk has the patient open when
// it sends a dose, and NONE of that crosses over: no name, no date of birth, no
// Jane number, not even the de-identified patient reference the tracker's own
// form allows. A dose arrives as a bottle, an amount, a time, and who gave and
// witnessed it — the same facts the paper Medication Usage Log carries, minus
// the patient column. Reconciling a dose back to a visit happens in Jane, where
// the chart note names the bottle, never here.
//
// The rules live here, not in Clinic Desk, so the Hub decides what a valid dose
// is for its own records. Pure functions only; the routes do the I/O.

export type DoseKind = "ketamine" | "spravato";

/** Which drug a tracked bottle holds, from how it was named when received. */
export function kindOf(substanceName: string | null | undefined): DoseKind | "other" {
  const s = String(substanceName ?? "").toLowerCase();
  if (/spravato|esketamine/.test(s)) return "spravato";
  if (/ketamine/.test(s)) return "ketamine";
  return "other";
}

/** Each Spravato nasal spray device delivers 28 mg. */
export const SPRAVATO_MG_PER_DEVICE = 28;

/**
 * How many mg one of this bottle's units holds, so a dose written in mg can be
 * taken off a bottle that counts in mL or devices. Null when the label doesn't
 * say — then Clinic Desk asks for the amount in the bottle's own unit rather
 * than guessing a concentration.
 */
export function mgPerUnit(unit: string | null | undefined, strength: string | null | undefined, kind: DoseKind | "other"): number | null {
  const u = String(unit ?? "").trim().toLowerCase();
  const st = String(strength ?? "");
  if (/^mgs?$|^milligrams?$/.test(u)) return 1;
  if (/^(ml|mls|milliliters?|millilitres?)$/.test(u)) {
    // "50 mg/mL", "500 mg / 10 mL", "100mg/ml"
    const m = st.match(/(\d+(?:\.\d+)?)\s*mg\s*\/\s*(\d+(?:\.\d+)?)?\s*ml/i);
    if (!m) return null;
    const mg = Number(m[1]);
    const ml = m[2] ? Number(m[2]) : 1;
    return mg > 0 && ml > 0 ? mg / ml : null;
  }
  if (/^devices?$|^sprays?$|^units?$|^each$/.test(u) && kind === "spravato") {
    const m = st.match(/(\d+(?:\.\d+)?)\s*mg/i);
    return m ? Number(m[1]) : SPRAVATO_MG_PER_DEVICE;
  }
  return null;
}

/** Counted in whole things (devices), so a dose can't take 1.5 of one. */
export function wholeUnits(unit: string | null | undefined): boolean {
  return /^(devices?|sprays?|units?|each|vials?|bottles?|kits?)$/i.test(String(unit ?? "").trim());
}

/** A bottle a provider can give from: checked out to someone, or already open. */
export const DOSEABLE_STATES = ["assigned_to_staff", "in_use"] as const;

// Every key Clinic Desk may send. Anything else — above all anything shaped
// like a patient field — refuses the whole request rather than being dropped,
// so a future Clinic Desk bug that starts attaching patient details fails
// loudly instead of quietly succeeding.
const TOP_KEYS = new Set(["ref", "kind", "administeredAt", "doseMg", "witness", "lines"]);
const LINE_KEYS = new Set(["bottleId", "amount", "waste"]);
const PATIENTISH = /patient|name|dob|birth|mrn|chart|pid|appointment|appt|visit|client|person|address|phone|email|ssn/i;

export interface DoseLine { bottleId: string; amount: number; waste: number }
export interface DoseRequest {
  ref: string;
  kind: DoseKind;
  administeredAt: string;
  doseMg: number;
  witness: string | null;
  lines: DoseLine[];
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : NaN);

export function parseDose(body: unknown, now = new Date()): { ok: true; dose: DoseRequest } | { ok: false; error: string } {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { ok: false, error: "Expected a dose." };
  const b = body as Record<string, unknown>;
  for (const k of Object.keys(b)) {
    if (!TOP_KEYS.has(k)) {
      return { ok: false, error: PATIENTISH.test(k)
        ? `Refused: the request carried "${k}". Compliance Hub takes no patient details from Clinic Desk.`
        : `Unexpected field "${k}".` };
    }
  }
  const ref = String(b.ref ?? "");
  if (!/^cd-[0-9a-f]{16,32}$/.test(ref)) return { ok: false, error: "Missing or malformed dose reference." };
  const kind = b.kind === "ketamine" || b.kind === "spravato" ? b.kind : null;
  if (!kind) return { ok: false, error: "The dose must be ketamine or Spravato." };

  const at = new Date(String(b.administeredAt ?? ""));
  if (Number.isNaN(at.getTime())) return { ok: false, error: "The time given isn't a date." };
  if (at.getTime() > now.getTime() + 10 * 60_000) return { ok: false, error: "That time is in the future." };
  if (at.getTime() < now.getTime() - 3 * 86_400_000) return { ok: false, error: "Doses older than three days are logged in Compliance Hub itself, with the paper log attached." };

  const doseMg = num(b.doseMg);
  if (!(doseMg > 0) || doseMg > 2000) return { ok: false, error: "The dose in mg is missing or out of range." };

  const witnessRaw = b.witness == null ? "" : String(b.witness);
  if (witnessRaw.length > 120) return { ok: false, error: "The witness name is too long." };
  const witness = witnessRaw.trim() || null;

  if (!Array.isArray(b.lines) || b.lines.length < 1 || b.lines.length > 4) return { ok: false, error: "A dose comes from one to four bottles." };
  const lines: DoseLine[] = [];
  const seen = new Set<string>();
  for (const raw of b.lines) {
    if (!raw || typeof raw !== "object") return { ok: false, error: "A bottle line is malformed." };
    const l = raw as Record<string, unknown>;
    for (const k of Object.keys(l)) {
      if (!LINE_KEYS.has(k)) return { ok: false, error: PATIENTISH.test(k) ? `Refused: a bottle line carried "${k}".` : `Unexpected bottle field "${k}".` };
    }
    const bottleId = String(l.bottleId ?? "");
    if (!UUID.test(bottleId)) return { ok: false, error: "A bottle id is malformed." };
    if (seen.has(bottleId)) return { ok: false, error: "The same bottle appears twice." };
    seen.add(bottleId);
    const amount = num(l.amount);
    const waste = l.waste == null ? 0 : num(l.waste);
    if (!(amount >= 0) || !(waste >= 0) || amount + waste <= 0) return { ok: false, error: "Each bottle needs an amount given or wasted." };
    lines.push({ bottleId, amount, waste });
  }
  if (lines.some((l) => l.waste > 0) && !witness) return { ok: false, error: "Waste needs a witness." };
  return { ok: true, dose: { ref, kind, administeredAt: at.toISOString(), doseMg, witness, lines } };
}

/** The state a bottle is left in, the way the tracker's own form decides it. */
export function nextState(balance: number, wasted: boolean): "depleted" | "wasted" | "in_use" {
  if (balance <= 1e-9) return wasted ? "wasted" : "depleted";
  return "in_use";
}

/** Tidy decimals: 0.1 + 0.2 must not be stored as 0.30000000000000004. */
export const round4 = (n: number) => Math.round(n * 10_000) / 10_000;

/** The marker stored on each event so a retried send is recognised, not doubled. */
export const lineRef = (ref: string, i: number) => `${ref}.${i + 1}`;
