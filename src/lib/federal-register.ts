/**
 * Federal Register change feed.
 *
 * The obligation register is only as good as the day it was written, so this
 * pulls what the government itself published since — from the Federal Register
 * public API — and matches it to the obligations we track.
 *
 * A note on trust: the API answers a bad filter by returning EVERYTHING rather
 * than erroring, which would flood the register with irrelevant documents. So
 * every result is re-checked locally against the term, the date and the document
 * type before it is allowed through, and a response that looks unfiltered is
 * rejected outright. Belt and braces on purpose.
 */

const API = "https://www.federalregister.gov/api/v1/documents.json";

/** Terms we watch, and the obligation each one belongs to (matched by title substring). */
export interface WatchTopic {
  key: string;
  /** Full-text phrase sent to the API and re-checked locally. */
  term: string;
  /** Substring of the obligation title this topic maps to. */
  obligationMatch: string;
}

export const WATCH_TOPICS: WatchTopic[] = [
  { key: "fmla",        term: "Family and Medical Leave Act",        obligationMatch: "FMLA" },
  { key: "cobra",       term: "COBRA continuation coverage",         obligationMatch: "COBRA" },
  { key: "aca_esrp",    term: "employer shared responsibility",      obligationMatch: "ACA employer mandate" },
  { key: "eeo1",        term: "EEO-1",                               obligationMatch: "EEO-1" },
  { key: "osha_record", term: "occupational injury and illness recording", obligationMatch: "OSHA injury and illness" },
  { key: "bbp",         term: "bloodborne pathogens",                obligationMatch: "OSHA injury and illness" },
  { key: "hazcom",      term: "hazard communication",                obligationMatch: "OSHA injury and illness" },
  { key: "pwfa",        term: "Pregnant Workers Fairness Act",       obligationMatch: "Pregnant Workers" },
  { key: "ada",         term: "Americans with Disabilities Act",     obligationMatch: "ADA Title I" },
  { key: "adea",        term: "Age Discrimination in Employment Act", obligationMatch: "ADEA" },
  { key: "flsa",        term: "Fair Labor Standards Act",            obligationMatch: "FLSA" },
  { key: "title7",      term: "Title VII of the Civil Rights Act",   obligationMatch: "Title VII" },
  { key: "hipaa",       term: "HIPAA privacy",                       obligationMatch: "HIPAA Privacy" },
];

/** Document types worth an alert. Notices and presidential documents are noise here. */
const KEEP_TYPES = new Set(["Rule", "Proposed Rule"]);

/** Field names confirmed against a live response on 2026-09-02. */
const FIELDS = [
  "document_number", "title", "type", "abstract", "publication_date",
  "effective_on", "comments_close_on", "html_url", "pdf_url", "agencies",
] as const;

export interface FrAgency { name?: string; raw_name?: string; slug?: string }

export interface FrDocument {
  document_number?: string;
  title?: string;
  type?: string;
  abstract?: string | null;
  publication_date?: string;
  effective_on?: string | null;
  comments_close_on?: string | null;
  html_url?: string;
  pdf_url?: string;
  agencies?: FrAgency[];
}

export interface FrResponse {
  description?: string;
  count?: number;
  results?: FrDocument[];
}

export function buildDocumentsUrl(opts: { term: string; since: string; perPage?: number }): string {
  const p = new URLSearchParams();
  p.set("per_page", String(opts.perPage ?? 40));
  p.set("order", "newest");
  p.set("conditions[term]", opts.term);
  p.set("conditions[publication_date][gte]", opts.since);
  for (const f of FIELDS) p.append("fields[]", f);
  return `${API}?${p.toString()}`;
}

/**
 * True when the response looks like the filter was ignored — the API's own
 * description says "All Documents", or the count is implausibly large for a
 * phrase search. Either way we refuse the batch rather than store noise.
 */
export function responseLooksUnfiltered(res: FrResponse): boolean {
  const desc = (res.description ?? "").toLowerCase();
  if (desc.includes("all documents")) return true;
  if ((res.count ?? 0) > 5000) return true;
  return false;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ");

/** Re-check a document locally: right type, published in range, and actually about the term. */
export function documentIsRelevant(doc: FrDocument, term: string, since: string): boolean {
  if (!doc.document_number || !doc.title) return false;
  if (doc.type && !KEEP_TYPES.has(doc.type)) return false;
  if (doc.publication_date && doc.publication_date < since) return false;

  const haystack = norm(`${doc.title} ${doc.abstract ?? ""}`);
  const needle = norm(term);
  // Match on the phrase, or on every significant word of it.
  if (haystack.includes(needle)) return true;
  const words = needle.split(" ").filter((w) => w.length > 3);
  return words.length > 0 && words.every((w) => haystack.includes(w));
}

export interface ScanHit {
  doc: FrDocument;
  topic: WatchTopic;
}

/** One topic's worth of results, already validated. Throws on a response we don't trust. */
export async function fetchTopic(
  topic: WatchTopic,
  since: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ hits: ScanHit[]; scanned: number; warning?: string }> {
  const res = await fetchImpl(buildDocumentsUrl({ term: topic.term, since }), {
    headers: { accept: "application/json" },
  });
  if (!res.ok) throw new Error(`Federal Register returned ${res.status} for "${topic.term}"`);

  const json = (await res.json()) as FrResponse;
  if (responseLooksUnfiltered(json)) {
    return {
      hits: [],
      scanned: 0,
      warning: `Skipped "${topic.term}": the API answered with an unfiltered result set (${json.description ?? "no description"}, count ${json.count ?? "?"}).`,
    };
  }

  const results = json.results ?? [];
  const hits = results
    .filter((d) => documentIsRelevant(d, topic.term, since))
    .map((doc) => ({ doc, topic }));
  return { hits, scanned: results.length };
}

/** Row shape for the law_alerts table. */
export function alertRowFrom(hit: ScanHit, obligationId: string | null) {
  const { doc, topic } = hit;
  return {
    source: "federal_register",
    document_number: doc.document_number ?? null,
    doc_type: doc.type ?? null,
    title: doc.title ?? "(untitled)",
    abstract: doc.abstract ?? null,
    agencies: (doc.agencies ?? []).map((a) => a.name ?? a.raw_name ?? "").filter(Boolean),
    publication_date: doc.publication_date ?? null,
    effective_date: doc.effective_on ?? null,
    comments_close_date: doc.comments_close_on ?? null,
    html_url: doc.html_url ?? null,
    pdf_url: doc.pdf_url ?? null,
    matched_terms: [topic.term],
    matched_obligation_id: obligationId,
    status: "new" as const,
  };
}

/** Default lookback when nothing has been scanned yet. */
export function defaultSince(daysBack = 45): string {
  return new Date(Date.now() - daysBack * 86_400_000).toISOString().slice(0, 10);
}
