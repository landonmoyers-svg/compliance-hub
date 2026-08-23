/**
 * Document analysis — on-device only.
 *
 * "Zero retention" from a cloud provider is a *contract*: a promise you cannot
 * verify, cannot enforce, and cannot revoke after the fact. The only version of
 * that guarantee which is actually assured is the one where no network call
 * happens at all.
 *
 * So this module has no network path. Not a disabled one, not one behind a flag
 * — none. There is no HTTP client here, no endpoint, no API key, no consent
 * token, because there is nothing to consent to. Verifying the claim "HomeVault
 * never sends my documents anywhere" means grepping this directory for `fetch`
 * and finding nothing, which is a check a household's technical friend can do in
 * ten seconds.
 *
 * ## What this costs, honestly
 *
 * Quality now depends entirely on what runs on the machine. In a browser that is
 * OCR plus the structural rules below — decent, because documents mostly
 * announce themselves ("POLICY DECLARATIONS", "Form W-2", "SOCIAL SECURITY"),
 * but no help at all on an unlabelled scan.
 *
 * On the desktop it is genuinely good: the platform already ships strong
 * on-device OCR (Apple Vision, Windows OCR), and a bundled small vision/text
 * model plugs in behind `LocalModel` below without changing anything else. That
 * is why the real product is a desktop build. Note that an Electron shell which
 * merely loads a hosted URL provides none of this — the code has to be bundled
 * and signed, or it is still unverifiable remote code.
 *
 * ## What still needs redaction
 *
 * Nothing here transmits, so `redact.ts` is not protecting this path any more.
 * It still guards every other path where text could reach a model — the coach,
 * and the AI search in docs/ROADMAP.md — and it keeps secrets out of logs and
 * crash reports. Its scope narrowed; its job did not go away.
 */

// ---------------------------------------------------------------------------
// What analysis produces
// ---------------------------------------------------------------------------

export interface DocumentInput {
  /** Stable id within this ingest batch. */
  id: string;
  /** Text extracted on-device by OCR. */
  text: string;
  /** Original filename, if any. Usually noise like `IMG_4523.HEIC`. */
  filename?: string;
  pageCount?: number;
}

export interface Analysis {
  documentId: string;
  /** e.g. "auto-insurance-declaration", "bank-statement", "passport". */
  documentType: string;
  /** Suggested vault category; the household can override. */
  category: string;
  /** Non-secret label proposed for the record. */
  label: string;
  /** Institution or issuer, when identifiable ("GEICO", "Chase"). */
  issuer?: string;
  /**
   * Grouping hint. Documents sharing a key are proposed as ONE record — pages of
   * a packet, or successive years of the same policy. Undefined means "don't
   * group this with anything", which is the safe answer when unsure.
   */
  groupKey?: string;
  confidence: number;
  /** How this was worked out, shown in the UI so the household can judge it. */
  via: "rules" | "local-model";
}

export interface DocumentAnalyzer {
  analyze(doc: DocumentInput): Promise<Analysis>;
}

/**
 * A model running on this machine.
 *
 * Deliberately narrow: it takes text and returns a classification. It is handed
 * no network capability and no storage, so a desktop build can swap in a real
 * vision/text model without widening what the ingest layer can do.
 */
export interface LocalModel {
  readonly name: string;
  classify(text: string): Promise<{
    documentType: string;
    category: string;
    label: string;
    issuer?: string;
    confidence: number;
  } | null>;
}

// ---------------------------------------------------------------------------
// The analyzer
// ---------------------------------------------------------------------------

export class LocalAnalyzer implements DocumentAnalyzer {
  // Written longhand rather than as a TypeScript parameter property: the test
  // runner strips types without transforming, and parameter properties are the
  // one bit of TS syntax that needs a real transform.
  private readonly model?: LocalModel;

  /**
   * @param model Optional on-device model. Absent in the browser build; supplied
   *   by the desktop build. Rules always run first because they are instant and
   *   certain when they match — there is no reason to spend a model run on a
   *   page that says "LAST WILL AND TESTAMENT" at the top.
   */
  constructor(model?: LocalModel) {
    this.model = model;
  }

  async analyze(doc: DocumentInput): Promise<Analysis> {
    const hay = doc.text.toLowerCase();
    const issuer = detectIssuer(doc.text);
    const rule = SIGNATURES.find((s) => s.match(hay));

    if (rule) {
      return {
        documentId: doc.id,
        documentType: rule.type,
        category: rule.category,
        label: buildLabel(rule.label, issuer),
        issuer,
        groupKey: groupKeyFor(rule.type, issuer, doc.text),
        confidence: rule.confidence,
        via: "rules",
      };
    }

    if (this.model) {
      const guess = await this.model.classify(doc.text);
      if (guess) {
        return {
          documentId: doc.id,
          ...guess,
          issuer: guess.issuer ?? issuer,
          documentId2: undefined,
          groupKey: groupKeyFor(guess.documentType, guess.issuer ?? issuer, doc.text),
          via: "local-model",
        } as Analysis;
      }
    }

    // Unrecognised. Say so plainly rather than guessing — a wrong confident
    // answer costs the household more than an honest "needs a look".
    return {
      documentId: doc.id,
      documentType: "unknown",
      category: "household",
      label: doc.filename ?? "Untitled document",
      issuer,
      groupKey: undefined,
      confidence: 0.2,
      via: this.model ? "local-model" : "rules",
    };
  }
}

// ---------------------------------------------------------------------------
// Grouping
// ---------------------------------------------------------------------------

/**
 * Which documents are the same real-world thing.
 *
 * This is where nearly all the manual labour lives: 200 scans are perhaps 45
 * records, because a mortgage packet is a dozen pages and a policy renews every
 * year. Getting it wrong in the merging direction is worse than not grouping at
 * all — two accounts at one bank silently collapsing into one record is a
 * mistake a household may never notice — so the key includes any account or
 * policy identifier found on the page.
 */
function groupKeyFor(type: string, issuer: string | undefined, text: string): string | undefined {
  if (type === "unknown") return undefined;
  const identifier = detectIdentifier(text);
  return [issuer ?? "", type, identifier ?? ""].join("|");
}

/**
 * A policy/account/member number, used to keep distinct accounts at the same
 * institution apart. Matched by label, since the numbers themselves have no
 * distinctive shape.
 */
function detectIdentifier(text: string): string | undefined {
  // Must contain a digit. Without that, "Account Summary" matches and captures
  // the word "Summary" — which is identical across every statement, so two
  // different accounts at one bank would collapse into a single record.
  const pattern =
    /\b(?:policy|account|acct|member|certificate)\s*(?:no\.?|number|#)?\s*[:.]?\s*([A-Z0-9][A-Z0-9-]{2,})/gi;

  for (const match of text.matchAll(pattern)) {
    if (/\d/.test(match[1])) return match[1];
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------

interface Signature {
  type: string;
  category: string;
  label: string;
  confidence: number;
  match: (lowercaseText: string) => boolean;
}

const has = (...needles: string[]) => (t: string) => needles.every((n) => t.includes(n));
const hasAny = (...needles: string[]) => (t: string) => needles.some((n) => t.includes(n));

/** Documents mostly announce what they are. This covers the common cases free. */
const SIGNATURES: Signature[] = [
  { type: "social-security-card", category: "identity", label: "Social Security card", confidence: 0.95,
    match: has("social security") },
  { type: "passport", category: "identity", label: "Passport", confidence: 0.9,
    match: hasAny("passport") },
  { type: "birth-certificate", category: "identity", label: "Birth certificate", confidence: 0.9,
    match: hasAny("certificate of live birth", "certificate of birth") },
  { type: "drivers-license", category: "identity", label: "Driver's licence", confidence: 0.85,
    match: hasAny("driver license", "driver's license", "driving licence") },
  { type: "auto-insurance-declaration", category: "insurance", label: "Auto insurance policy", confidence: 0.9,
    match: (t) => t.includes("declarations") && hasAny("automobile", "auto policy", "vehicle")(t) },
  { type: "home-insurance-declaration", category: "insurance", label: "Homeowners policy", confidence: 0.9,
    match: (t) => t.includes("declarations") && hasAny("homeowner", "dwelling", "property")(t) },
  { type: "life-insurance", category: "insurance", label: "Life insurance policy", confidence: 0.85,
    match: has("life insurance") },
  { type: "bank-statement", category: "financial", label: "Bank statement", confidence: 0.85,
    match: hasAny("statement period", "account summary", "beginning balance") },
  { type: "tax-return", category: "financial", label: "Tax return", confidence: 0.9,
    match: hasAny("form 1040", "individual income tax return") },
  { type: "w2", category: "financial", label: "W-2", confidence: 0.95,
    match: hasAny("form w-2", "wage and tax statement") },
  { type: "brokerage-statement", category: "financial", label: "Investment account", confidence: 0.8,
    match: hasAny("brokerage", "portfolio summary", "holdings as of") },
  { type: "mortgage", category: "property", label: "Mortgage", confidence: 0.85,
    match: hasAny("promissory note", "deed of trust", "mortgage statement") },
  { type: "deed", category: "property", label: "Property deed", confidence: 0.85,
    match: hasAny("warranty deed", "quitclaim", "grant deed") },
  { type: "vehicle-title", category: "property", label: "Vehicle title", confidence: 0.85,
    match: has("certificate of title") },
  { type: "will", category: "estate", label: "Will", confidence: 0.9,
    match: hasAny("last will and testament", "i declare this to be my will") },
  { type: "trust", category: "estate", label: "Trust", confidence: 0.85,
    match: hasAny("revocable trust", "living trust", "trust agreement") },
  { type: "power-of-attorney", category: "estate", label: "Power of attorney", confidence: 0.9,
    match: has("power of attorney") },
  { type: "advance-directive", category: "medical", label: "Advance directive", confidence: 0.9,
    match: hasAny("advance directive", "living will", "health care proxy") },
  { type: "immunization", category: "medical", label: "Vaccination record", confidence: 0.85,
    match: hasAny("immunization", "vaccination record") },
  { type: "lab-result", category: "medical", label: "Lab results", confidence: 0.8,
    match: hasAny("reference range", "specimen collected") },
  { type: "diploma", category: "education", label: "Diploma", confidence: 0.8,
    match: hasAny("bachelor of", "master of", "has conferred upon") },
  { type: "transcript", category: "education", label: "Transcript", confidence: 0.8,
    match: hasAny("official transcript", "cumulative gpa") },
];

/** Institutions worth recognising by name, for grouping and labelling. */
const ISSUERS = [
  "GEICO", "State Farm", "Progressive", "Allstate", "USAA", "Liberty Mutual", "Farmers", "Nationwide",
  "Chase", "Bank of America", "Wells Fargo", "Citibank", "Capital One", "Ally", "Discover",
  "Fidelity", "Vanguard", "Schwab", "E*TRADE", "Robinhood",
  "Aetna", "Cigna", "UnitedHealthcare", "Blue Cross", "Kaiser", "Humana",
];

function detectIssuer(text: string): string | undefined {
  const upper = text.toUpperCase();
  return ISSUERS.find((name) => upper.includes(name.toUpperCase()));
}

function buildLabel(base: string, issuer?: string): string {
  return issuer ? `${issuer} ${base.toLowerCase()}` : base;
}
