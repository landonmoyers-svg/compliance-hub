import type { ComplianceDocument, RegulatorySource } from "@/lib/data/schema";

/**
 * Cross-reference SOPs (ComplianceDocument) and regulatory sources without a
 * stored link, by matching:
 *  - explicit citations (the source's citation label appearing in a SOP's text), and
 *  - shared domain acronyms (e.g. HIPAA, OSHA, DEA) between a SOP's area/title and
 *    the regulation.
 * Surfaces relations both directions and flags regulations that have NO related
 * SOP — the alignment gaps to close. Matches are suggestions; the AI alignment
 * check verifies real coverage.
 */

// Generic tokens that would over-match if treated as a domain acronym.
const STOP = new Set(["CFR", "USC", "THE", "AND", "FOR", "ACT", "LAW", "RULE", "PART", "SEC", "SUB", "ETC", "NON", "ANY", "ALL"]);

function acronyms(...texts: (string | null | undefined)[]): Set<string> {
  const out = new Set<string>();
  for (const t of texts) {
    for (const m of (t ?? "").matchAll(/\b[A-Z][A-Z0-9]{2,6}\b/g)) {
      const a = m[0].toUpperCase();
      if (!STOP.has(a)) out.add(a);
    }
  }
  return out;
}

/** Searchable forms of a citation label, e.g. "45 CFR § 164.312" → ["45 cfr § 164.312", "45cfr164.312", "164.312"]. */
function citeForms(label?: string | null): string[] {
  const l = (label ?? "").trim();
  if (!l) return [];
  const spaced = l.toLowerCase();
  const compact = spaced.replace(/[\s§.]/g, "");
  const core = (l.match(/\d{2,4}(?:\.\d+)+/g) ?? []).map((s) => s.toLowerCase());
  return [...new Set([spaced, compact, ...core])].filter((x) => x.length >= 4);
}

export interface SopSourceLinks {
  /** SOP id → the regulatory sources it relates to. */
  sourcesForDoc: Map<string, RegulatorySource[]>;
  /** Source id → the SOPs that relate to it. */
  docsForSource: Map<string, ComplianceDocument[]>;
  /** Sources with no related SOP — alignment gaps. */
  gapSourceIds: Set<string>;
}

export function linkSopsAndSources(docs: ComplianceDocument[], sources: RegulatorySource[]): SopSourceLinks {
  const srcIndex = sources.map((s) => ({
    s,
    acr: acronyms(s.title, s.issuingBody, s.citationLabel),
    cites: citeForms(s.citationLabel),
  }));

  const sourcesForDoc = new Map<string, RegulatorySource[]>();
  const docsForSource = new Map<string, ComplianceDocument[]>();

  for (const d of docs) {
    // Domain acronyms come from the SOP's title/area/summary (not its full body,
    // to avoid a single stray mention over-linking); explicit citations are
    // matched against the full text including extracted content.
    const dAcr = acronyms(d.title, d.complianceArea, d.summary);
    const hay = `${d.title} ${d.complianceArea ?? ""} ${d.summary ?? ""} ${d.content ?? ""}`.toLowerCase();
    for (const { s, acr, cites } of srcIndex) {
      const citeHit = cites.some((c) => hay.includes(c));
      const acrHit = [...acr].some((a) => dAcr.has(a));
      if (citeHit || acrHit) {
        (sourcesForDoc.get(d.id) ?? sourcesForDoc.set(d.id, []).get(d.id)!).push(s);
        (docsForSource.get(s.id) ?? docsForSource.set(s.id, []).get(s.id)!).push(d);
      }
    }
  }

  const gapSourceIds = new Set(sources.filter((s) => !docsForSource.get(s.id)?.length).map((s) => s.id));
  return { sourcesForDoc, docsForSource, gapSourceIds };
}
