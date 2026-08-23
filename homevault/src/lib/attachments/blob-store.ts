import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Where encrypted attachment bytes live.
 *
 * The store sees an opaque id and an opaque blob. Not the filename, not the
 * media type, not the size of the original — those are sensitive on their own
 * ("passport_scan.pdf" tells you plenty) and live inside the record's encrypted
 * payload instead.
 *
 * Kept behind an interface for the same reason as `DataClient`: the desktop
 * build will write to the local filesystem rather than to Supabase, and nothing
 * above this line should have to care.
 */
export interface BlobStore {
  put(key: BlobKey, bytes: Uint8Array): Promise<void>;
  get(key: BlobKey): Promise<Uint8Array | null>;
  remove(key: BlobKey): Promise<void>;
}

/**
 * Household id is part of the path so storage-level access rules can scope by
 * household without needing to understand anything else about the contents.
 */
export interface BlobKey {
  householdId: string;
  attachmentId: string;
}

export function blobPath(key: BlobKey): string {
  return `${key.householdId}/${key.attachmentId}`;
}

/**
 * Guard against a single file exhausting browser memory.
 *
 * Encrypting in one pass needs roughly twice the file size in RAM, and the
 * result is base64'd for transport in places. 25 MB is comfortably above a
 * multi-page scan and well below the point where a phone browser falls over.
 * Chunked streaming would lift this, and is worth doing before video.
 */
export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;

export class AttachmentTooLargeError extends Error {
  constructor(sizeBytes: number) {
    super(
      `That file is ${(sizeBytes / 1024 / 1024).toFixed(1)} MB. The current limit is ${
        MAX_ATTACHMENT_BYTES / 1024 / 1024
      } MB — try a lower-resolution scan, or split it into parts.`,
    );
    this.name = "AttachmentTooLargeError";
  }
}

// ---------------------------------------------------------------------------

/** In-memory store. Used by tests, and by the demo, which persists nothing. */
export class MemoryBlobStore implements BlobStore {
  private readonly blobs = new Map<string, Uint8Array>();

  async put(key: BlobKey, bytes: Uint8Array): Promise<void> {
    this.blobs.set(blobPath(key), bytes);
  }

  async get(key: BlobKey): Promise<Uint8Array | null> {
    return this.blobs.get(blobPath(key)) ?? null;
  }

  async remove(key: BlobKey): Promise<void> {
    this.blobs.delete(blobPath(key));
  }

  get size(): number {
    return this.blobs.size;
  }
}

// ---------------------------------------------------------------------------

export const ATTACHMENTS_BUCKET = "attachments";

/**
 * Supabase Storage. The bucket is private; access is governed by policies on
 * `storage.objects` that check household membership, mirroring the RLS on the
 * tables. Even with the bucket reachable, the bytes are ciphertext.
 */
export class SupabaseBlobStore implements BlobStore {
  private readonly supabase: SupabaseClient;

  constructor(supabase: SupabaseClient) {
    this.supabase = supabase;
  }

  async put(key: BlobKey, bytes: Uint8Array): Promise<void> {
    const { error } = await this.supabase.storage.from(ATTACHMENTS_BUCKET).upload(blobPath(key), bytes, {
      // Opaque on purpose: declaring the real type would leak what the document
      // is to anyone who can list the bucket.
      contentType: "application/octet-stream",
      upsert: false,
    });
    if (error) throw new Error(`Could not store that file — ${error.message}`);
  }

  async get(key: BlobKey): Promise<Uint8Array | null> {
    const { data, error } = await this.supabase.storage.from(ATTACHMENTS_BUCKET).download(blobPath(key));
    if (error) {
      // A missing object is a normal outcome (deleted elsewhere, or a stale
      // reference); anything else is a real failure worth surfacing.
      if (/not found|does not exist/i.test(error.message)) return null;
      throw new Error(`Could not read that file — ${error.message}`);
    }
    return data ? new Uint8Array(await data.arrayBuffer()) : null;
  }

  async remove(key: BlobKey): Promise<void> {
    const { error } = await this.supabase.storage.from(ATTACHMENTS_BUCKET).remove([blobPath(key)]);
    if (error) throw new Error(`Could not delete that file — ${error.message}`);
  }
}
