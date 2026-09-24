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
 *     <archiveKey>__<archiveLibrary>__<folderLabel>__<originalName>
 *     a3f1c8d2__Clinic 2 Archive__2024-03 Ketamine administration log__page-1.jpg
 *               └──── which library ────┘└──── which folder in it ────┘
 *
 * The LIBRARY matters as much as the folder. One inbox can feed more than one
 * archive — a site keeps its individual registration's records and later its
 * location registration's records, and those are separate bodies an inspector
 * asks for separately. If the flow had to know which archive to use, adding a
 * registration would mean editing the flow. It doesn't: the file says.
 *
 * The folder is named for the ORIGINAL filing, and an amendment reuses its
 * parent's key — so a correction lands beside what it corrects, and the folder
 * keeps its place in a date-sorted view instead of jumping to today.
 *
 * Both ends of this contract are easy to break silently, which is why the
 * parsing is here, tested, rather than only as an expression inside a flow.
 * The other end is written down in docs/controlled-substance-filing-flow.md —
 * change one without the other and files stop moving, quietly.
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

/** What the three paper logs are called, everywhere. */
export const PAPER_LOG_LABEL = {
  vial_log: "Vial log (paper)",
  administration_log: "Administration log (paper)",
  count_sheet: "Count sheet (paper)",
} as const;

export type PaperLogType = keyof typeof PAPER_LOG_LABEL;

/**
 * The folder label for a paper log, derived from the log itself.
 *
 * This exists because the label is computed TWICE and the two must agree
 * exactly: once when a log is filed, and again when an amendment to it is
 * filed and has to reuse its parent's folder. They were assembled separately,
 * from different inputs — one used the location's name, the other the whole
 * registration label — so an amendment landed in a folder of its own with the
 * same key, which is precisely what reusing the key is supposed to prevent.
 *
 * So there is one function, it takes the log rather than pre-formatted pieces,
 * and neither caller gets to decide what goes in.
 */
export function logFolderLabel(log: {
  recordType: PaperLogType;
  /** The site where the doses were given — not the registration it was ordered on. */
  locationName?: string | null;
  substanceName?: string | null;
  periodStart?: string | null;
  periodEnd?: string | null;
  recordDate?: string | null;
}): string {
  return folderLabel({
    locationName: log.locationName,
    substanceName: log.substanceName,
    recordTypeLabel: PAPER_LOG_LABEL[log.recordType],
    periodStart: log.periodStart,
    periodEnd: log.periodEnd,
    recordDate: log.recordDate,
  });
}

/** The name a file is uploaded under, carrying its whole destination with it. */
export function inboxFileName(archiveKey: string, archiveLibrary: string, label: string, originalName: string): string {
  return [sanitize(archiveKey), sanitize(archiveLibrary), sanitize(label), sanitize(originalName)].join(SEPARATOR);
}

/**
 * The library name out of a SharePoint folder URL, which is what the Hub
 * stores on a registration. ".../sites/X/Clinic 2 Archive" -> "Clinic 2 Archive".
 */
export function libraryFromUrl(url: string | null | undefined): string {
  const path = (url ?? "").split("?")[0].replace(/\/+$/, "");
  const last = path.split("/").pop() ?? "";
  try { return sanitize(decodeURIComponent(last)); } catch { return sanitize(last); }
}

/** The folder the flow should move it into, relative to the Archive library. */
export function archiveFolderName(archiveKey: string, label: string): string {
  return `${sanitize(label)} [${sanitize(archiveKey)}]`;
}

/**
 * Where a filed log will live, as a link that can be stored before it gets
 * there.
 *
 * The obvious thing — keep the URL SharePoint hands back when the page is
 * uploaded — is wrong, and quietly so. That URL identifies the INBOX copy by
 * its unique id, and the flow archives by copying and then deleting; the
 * archived file is a different item with a different id. So the link dies at
 * the moment filing succeeds, and the Hub is left holding a record it can't
 * produce the pages for — which is the one thing the link is for.
 *
 * This is built from the destination instead, which is already decided here:
 * the archive library on the registration, plus the folder the flow will make.
 * It points at the FOLDER rather than a page, because the folder is what a
 * person actually wants — every page, the entry index, and later any amendment,
 * which reuses this key and so lands in this same folder.
 */
export function archiveFolderUrl(libraryUrl: string | null | undefined, archiveKey: string, label: string): string | null {
  const base = (libraryUrl ?? "").split("?")[0].replace(/\/+$/, "");
  if (!base) return null;

  let library: URL;
  try { library = new URL(base); } catch { return null; }

  // The id parameter wants the server-relative path unencoded, then encoded
  // once as a whole. A stored URL may arrive either way round.
  let libraryPath = library.pathname;
  try { libraryPath = decodeURIComponent(libraryPath); } catch { /* already decoded */ }

  const folder = `${libraryPath}/${archiveFolderName(archiveKey, label)}`;
  return `${library.origin}${library.pathname}/Forms/AllItems.aspx?id=${encodeURIComponent(folder)}`;
}

export interface ParsedName {
  archiveKey: string;
  /** Which archive library it belongs in. */
  archiveLibrary: string;
  folderLabel: string;
  fileName: string;
  /** Where it belongs inside that library. */
  archivePath: string;
}

/**
 * Read a destination back off a filename. Returns null for anything that
 * doesn't carry one — the flow should leave those alone and let the integrity
 * check notice, rather than guessing a folder and burying the file.
 */
export function parseInboxFileName(name: string): ParsedName | null {
  const parts = name.split(SEPARATOR);
  if (parts.length < 4) return null;
  const [archiveKey, archiveLibrary, label, ...rest] = parts;
  const fileName = rest.join(SEPARATOR);
  if (!archiveKey.trim() || !archiveLibrary.trim() || !label.trim() || !fileName.trim()) return null;
  return {
    archiveKey,
    archiveLibrary,
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
