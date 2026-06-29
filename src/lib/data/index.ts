import type { DataClient } from "./client";
import { createSupabaseDataClient } from "./supabase-client";

// Active DataClient. Backed by Supabase — swap this line to revert to the mock.
let instance: DataClient | null = null;

export function db(): DataClient {
  if (!instance) instance = createSupabaseDataClient();
  return instance;
}

export type { DataClient, Collection, CollectionName } from "./client";
export * from "./schema";
