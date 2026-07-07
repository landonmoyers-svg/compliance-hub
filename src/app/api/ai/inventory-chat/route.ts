import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const BASE_PROMPT = `You are the Inventory Assistant for Lone Peak Psychiatry. You answer questions about the practice's physical inventory: what items exist, where they are located, their condition, quantity, and estimated value.

Guidelines:
- Answer ONLY from the inventory data provided below. Do not invent items, locations, or values.
- When asked what is in a location, list the items at that location with quantity and condition.
- When asked about value, sum the estimated values of the relevant items and show the total; note that values are AI estimates, not appraisals.
- If an item's location is unassigned, say so rather than guessing.
- Be concise and use simple lists. If the data below is empty, say the inventory has no items yet.`;

/** Build a grounding block of the live inventory grouped by location. */
async function buildInventoryContext(supabase: SupabaseClient): Promise<string> {
  const [invRes, locRes] = await Promise.all([
    supabase
      .from("inventory")
      .select("item_name, item_type, status, condition, quantity, estimated_value_cents, location_id, sublocation, description")
      .neq("status", "removed")
      .limit(1000),
    supabase.from("locations").select("id, name").limit(200),
  ]);

  const items = (invRes.data ?? []) as {
    item_name: string; item_type: string; status: string; condition: string;
    quantity: number | null; estimated_value_cents: number | null;
    location_id: string | null; sublocation: string | null; description: string | null;
  }[];
  const locs = (locRes.data ?? []) as { id: string; name: string }[];
  const locName = new Map(locs.map((l) => [l.id, l.name]));

  if (items.length === 0) {
    return "\n\n=== INVENTORY ===\n(No inventory items have been catalogued yet.)\n=== END INVENTORY ===";
  }

  // Group items by location name.
  const groups = new Map<string, string[]>();
  for (const it of items) {
    const loc = it.location_id ? (locName.get(it.location_id) ?? "Unknown location") : "Unassigned location";
    const qty = it.quantity && it.quantity > 1 ? ` ×${it.quantity}` : "";
    const val = it.estimated_value_cents != null ? ` (~$${(it.estimated_value_cents / 100).toFixed(0)})` : "";
    const sub = it.sublocation ? ` [${it.sublocation}]` : "";
    const line = `  • ${it.item_name}${qty} — ${it.condition}, ${it.status}${val}${sub}`;
    if (!groups.has(loc)) groups.set(loc, []);
    groups.get(loc)!.push(line);
  }

  let ctx = "\n\n=== INVENTORY (grouped by location) ===\n";
  for (const [loc, lines] of groups) {
    ctx += `\n${loc}:\n${lines.join("\n")}\n`;
  }
  const total = items.reduce((s, i) => s + (i.estimated_value_cents ?? 0), 0);
  ctx += `\nTotal estimated value of catalogued items: ~$${(total / 100).toFixed(0)} (AI estimates).\n`;
  ctx += "=== END INVENTORY ===";
  return ctx;
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json() as { messages: { role: "user" | "assistant"; content: string }[] };
  const { messages } = body;
  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json({ error: "messages array required" }, { status: 400 });
  }

  let context = "";
  try {
    context = await buildInventoryContext(supabase);
  } catch {
    context = "";
  }

  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    system: BASE_PROMPT + context,
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
  });

  const text = response.content
    .filter((b) => b.type === "text")
    .map((b) => (b as { type: "text"; text: string }).text)
    .join("");

  return NextResponse.json({ text });
}
