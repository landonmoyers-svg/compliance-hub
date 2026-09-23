/**
 * The naming contract between the browser and the flow that files things away.
 *
 * Uploads land in an Inbox that the people filing can write to but that holds
 * nothing for long. A Power Automate flow moves each file into the Archive,
 * which filers cannot read at all — and it has to decide the destination
 * without asking anything. It can't call the Hub, and it can't wait for a
 * database row that doesn't exist yet.
 *
 * So the destination travels IN THE FILENAME:
 *
 *     <archiveKey>__<folderLabel>__<originalName>
 *     a3f1c8d2__2024-03 Ketamine administration log__page-1.jpg
 *                └─ becomes ─┘
 *     Archive/2024-03 Ketamine administration log [a3f1c8d2]/page-1.jpg
 *
 * The folder is named for the ORIGINAL filing, and an amendment reuses its
 * parent's key — so a correction lands beside what it corrects, and the folder
 * keeps its place in a date-sorted view instead of jumping to today.
 *
 * Both ends of this contract are easy to break silently, which is why the
 * parsing is here, tested, rather than only as an expression inside a flow.
 */

/** Characters SharePoint refuses in a file or folder name, plus our separator. */
const ILLEGAL = /[\\/:*?"<>|#%~&{}]+/g;

export const SEPARATOR = "__";

/** A short, stable key for a log and every amendment to it. */
export function newArchiveKey(): string {
  // Short enough to read in a folder name, long enough not to collide across
  // the life of a practice's archive.
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function sanitize(part: string): string {
  return part.replace(ILLEGAL, "-").replace(/\s+/g, " ").replace(new RegExp(SEPARATOR, "g"), "-").trim();
}

/**
 * The human half of the folder name: which clinic, the period it covers (or its
 * date), the substance, and what kind of log it is.
 *
 * The clinic comes first and is not decoration. Murray and Lehi are separate
 * DEA registrations keeping separate logs, and they file into separate
 * libraries — so if a file ever lands in the wrong one, the name says so
 * instead of it sitting there looking like it belongs.
 */
export function folderLabel(input: {
  locationName?: string | null;
  substanceName?: string | null;
  recordTypeLabel: string;
  periodStart?: string | null;
  periodEnd?: string | null;
  recordDate?: string | null;
}): string {
  const when = input.periodStart
    ? input.periodStart.slice(0, 7)
    : (input.recordDate ?? "").slice(0, 7);
  return sanitize([when, input.locationName, input.substanceName ?? "Controlled substance", input.recordTypeLabel.toLowerCase()]
    .filter(Boolean).join(" "));
}

/** The name a file is uploaded under, carrying its destination with it. */
export function inboxFileName(archiveKey: string, label: string, originalName: string): string {
  return [sanitize(archiveKey), sanitize(label), sanitize(originalName)].join(SEPARATOR);
}

/** The folder the flow should move it into, relative to the Archive library. */
export function archiveFolderName(archiveKey: string, label: string): string {
  return `${sanitize(label)} [${sanitize(archiveKey)}]`;
}

export interface ParsedName {
  archiveKey: string;
  folderLabel: string;
  fileName: string;
  /** Where it belongs, relative to the Archive library root. */
  archivePath: string;
}

/**
 * Read a destination back off a filename. Returns null for anything that
 * doesn't carry one — the flow should leave those alone and let the integrity
 * check notice, rather than guessing a folder and burying the file.
 */
export function parseInboxFileName(name: string): ParsedName | null {
  const parts = name.split(SEPARATOR);
  if (parts.length < 3) return null;
  const [archiveKey, label, ...rest] = parts;
  const fileName = rest.join(SEPARATOR);
  if (!archiveKey.trim() || !label.trim() || !fileName.trim()) return null;
  return {
    archiveKey,
    folderLabel: label,
    fileName,
    archivePath: `${archiveFolderName(archiveKey, label)}/${fileName}`,
  };
}

/* ------------------------------------------------------------- hashing */

/**
 * SHA-256 of a file, computed before it leaves the browser. Stored on the Hub
 * record so that "has this been altered?" can be answered from outside
 * SharePoint.
 */
export async function hashFile(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}
