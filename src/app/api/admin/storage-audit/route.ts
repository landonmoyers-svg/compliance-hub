import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const PRIVILEGED = ["owner", "admin", "hr", "clinical_leadership"];
const BUCKET = "documents";

/**
 * Read-only storage audit: reconciles every object in the private `documents`
 * bucket against the storage paths referenced by DB records, and reports which
 * files are unreferenced. It DELETES NOTHING — it's a visibility tool.
 *
 * Important nuance: the Bulk Upload flow parks files under `bulk/` BEFORE they're
 * attached to a record, so an unreferenced `bulk/` object is usually "pending
 * filing", not junk. We classify those separately from true strays so nobody
 * mistakes a pending upload for a deletable orphan.
 */

interface StorageObject { name: string; size: number; updatedAt: string | null }

/** Recursively list every object under a prefix (Storage list() is one level). */
async function listAll(
  admin: NonNullable<ReturnType<typeof createAdminClient>>,
  prefix: string,
  out: StorageObject[],
  depth = 0,
): Promise<void> {
  if (depth > 12) return; // guard against pathological nesting
  const { data, error } = await admin.storage.from(BUCKET).list(prefix, { limit: 1000, sortBy: { column: "name", order: "asc" } });
  if (error || !data) return;
  for (const entry of data) {
    // A folder has no id/metadata; a file carries metadata (size).
    const isFile = !!(entry as { id?: string }).id || !!entry.metadata;
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (isFile) {
      out.push({
        name: path,
        size: Number(entry.metadata?.size ?? 0),
        updatedAt: (entry.updated_at as string | undefined) ?? (entry.created_at as string | undefined) ?? null,
      });
    } else {
      await listAll(admin, path, out, depth + 1);
    }
  }
}

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: caller } = await supabase.from("profiles").select("account_role").eq("user_id", user.id).single();
  if (!caller || !PRIVILEGED.includes(caller.account_role)) {
    return NextResponse.json({ error: "Forbidden — admin access required." }, { status: 403 });
  }

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "Not configured (SUPABASE_SERVICE_ROLE_KEY missing)." }, { status: 501 });

  // 1) Every (table, column) that can hold a storage path. Over-inclusive on
  //    purpose: a column that actually holds an external URL is harmless (those
  //    values are http-filtered below and never match a bucket object), whereas
  //    OMITTING a real storage column would wrongly flag its files as stray.
  //    Keep in sync when a new document-bearing table is added.
  const PATH_COLUMNS: [table: string, column: string][] = [
    ["audit_items", "evidence_url"],
    ["business_records", "document_url"],
    ["controlled_substance_events", "document_url"],
    ["credentials", "document_url"],
    ["dea_records", "document_url"],
    ["documents", "file_url"],
    ["employee_documents", "file_url"],
    ["exclusion_screenings", "document_url"],
    ["form_templates", "file_url"],
    ["incidents", "evidence_url"],
    ["insurance_policies", "document_url"],
    ["inventory", "image_url"],
    ["osha_records", "document_url"],
    ["payer_contracts", "contract_document_url"],
    ["payer_contracts", "fee_schedule_url"],
    ["payer_enrollments", "application_document_url"],
    ["vendors", "baa_document_url"],
    ["vendors", "insurance_document_url"],
  ];

  // 2) Collect all referenced, non-external (storage) paths across those columns.
  const referenced = new Set<string>();
  for (const [table, column] of PATH_COLUMNS) {
    const { data: vals } = await admin.from(table).select(column);
    for (const row of (vals ?? []) as unknown as Record<string, unknown>[]) {
      const v = row[column];
      if (typeof v === "string" && v && !/^https?:\/\//i.test(v)) referenced.add(v.replace(/^\/+/, ""));
    }
  }

  // 3) List every object in the bucket.
  const objects: StorageObject[] = [];
  await listAll(admin, "", objects);

  // 4) Reconcile.
  const orphans = objects.filter((o) => !referenced.has(o.name));
  const pending = orphans.filter((o) => o.name.startsWith("bulk/"));
  const stray = orphans.filter((o) => !o.name.startsWith("bulk/"));
  const sum = (arr: StorageObject[]) => arr.reduce((n, o) => n + o.size, 0);

  return NextResponse.json({
    totalFiles: objects.length,
    totalBytes: sum(objects),
    referencedCount: referenced.size,
    pending: { count: pending.length, bytes: sum(pending) },
    stray: {
      count: stray.length,
      bytes: sum(stray),
      // Cap the itemized list so the payload stays small; oldest first.
      files: stray
        .sort((a, b) => (a.updatedAt ?? "").localeCompare(b.updatedAt ?? ""))
        .slice(0, 200)
        .map((o) => ({ path: o.name, size: o.size, updatedAt: o.updatedAt })),
    },
  });
}
