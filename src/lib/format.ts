/**
 * Display formatting for people's names and enum/snake_case labels.
 *
 * - `formatName` — Title-cases a person's name (so "landon" → "Landon"),
 *   preserving names that already carry intentional mixed case (McDonald).
 * - `humanizeLabel` — turns an enum / snake_case / kebab value into a readable
 *   label AND uppercases known acronyms, so "sop" → "SOP", "osha_record" →
 *   "OSHA Record", "hr" → "HR" — instead of the "Sop"/"Osha"/"Hr" that a plain
 *   CSS `capitalize` produces.
 */

// Terms that must render fully uppercased. Compared case-insensitively.
const ACRONYMS = new Set([
  // compliance / regulatory
  "sop", "hipaa", "hr", "osha", "dea", "sds", "pto", "capa", "sra", "baa",
  "oig", "sam", "phi", "epa", "cms", "cdc", "fda", "ada", "fmla", "cobra",
  "eap", "hsa", "fsa", "leie", "bci", "fbi", "dopl", "ferpa", "phi",
  // clinical roles / certs
  "rn", "lpn", "cna", "ma", "pa", "md", "do", "np", "aprn", "pmhnp", "lcsw",
  "lmft", "cmhc", "cpr", "bls", "acls", "ekg", "iv",
  // business / ids
  "npi", "ein", "tin", "ssn", "id", "ai", "faq", "pdf", "url", "us", "usa",
  "w2", "w4", "i9", "1099", "401k", "llc", "inc", "pc", "dba", "ceo", "cfo",
  "coo", "cco", "cio", "it", "qa",
  // behavioral health dx (shown in some labels)
  "ptsd", "adhd", "ocd", "gad", "mdd", "bpd", "oud", "sud",
]);

function titleCaseWord(word: string): string {
  if (!word) return word;
  const isAllLower = word === word.toLowerCase();
  const isAllUpper = word === word.toUpperCase();
  // Leave already-mixed-case words alone (e.g. McDonald, DeVry, O'Brien).
  if (!isAllLower && !isAllUpper) return word;
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}

/**
 * Title-case a person's full name. Handles spaces, hyphens, and apostrophes
 * ("mary-jane o'brien" → "Mary-Jane O'Brien"). Returns "" for empty input.
 */
export function formatName(raw?: string | null): string {
  if (!raw) return "";
  return raw
    .trim()
    .split(/\s+/)
    .map((token) =>
      token
        .split(/([-'])/) // keep the hyphen/apostrophe delimiters
        .map((seg) => (seg === "-" || seg === "'" ? seg : titleCaseWord(seg)))
        .join(""),
    )
    .join(" ");
}

/**
 * Humanize an enum / snake_case / kebab-case value into a readable label,
 * uppercasing any known acronym. "osha_record" → "OSHA Record".
 * Returns "" for null/undefined/empty.
 */
export function humanizeLabel(raw?: string | null): string {
  if (raw === null || raw === undefined) return "";
  const s = String(raw).trim();
  if (!s) return "";
  return s
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .split(" ")
    .map((word) => {
      const lower = word.toLowerCase();
      if (ACRONYMS.has(lower)) return lower.toUpperCase();
      return titleCaseWord(word);
    })
    .join(" ");
}
