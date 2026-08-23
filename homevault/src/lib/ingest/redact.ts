/**
 * On-device redaction — the gate every document passes through before any of it
 * can reach a model.
 *
 * This implements the rule docs/SECURITY.md § 6 already states: account numbers,
 * SSNs and passwords are replaced with typed placeholders before anything leaves
 * the device. It was written into the contract and never built; this is it.
 *
 * ## The idea in one line
 *
 * A classifier needs *structure*, not *secrets*. "Social Security card, Name:
 * ⟪NAME⟫, Number: ⟪SSN⟫" is enough to file a document correctly, and useless to
 * anyone who intercepts it. So we keep the layout and throw away the values.
 *
 * ## Design rules, in priority order
 *
 * 1. **Over-redact.** A false positive costs a little classification accuracy.
 *    A false negative puts a real SSN on the wire. These are not comparable, so
 *    every ambiguous case is redacted.
 * 2. **Never mutate in place.** The original text is returned untouched
 *    alongside the sanitized copy; callers seal the original and transmit only
 *    the copy. Nothing here can accidentally overwrite the real document.
 * 3. **Report confidence honestly.** When the text is too garbled to be sure we
 *    caught everything, say so, so the UI can stop and ask rather than guess.
 * 4. **Typed placeholders, not blanks.** `⟪SSN⟫` tells the model a Social
 *    Security number was here, which is exactly the signal it needs; `[hidden]`
 *    throws that away too.
 */

export type SensitiveKind =
  | "ssn"
  | "card"
  | "routing"
  | "account"
  | "passport"
  | "license"
  | "phone"
  | "email"
  | "dob"
  | "name"
  | "address"
  | "secret";

/** A stretch of the original text that must not be transmitted. */
export interface RedactionSpan {
  start: number;
  end: number;
  kind: SensitiveKind;
  /** Why this matched, for the pre-flight preview. */
  reason: string;
}

export interface RedactionResult {
  /** Safe to transmit. The original is never modified. */
  sanitized: string;
  spans: RedactionSpan[];
  counts: Partial<Record<SensitiveKind, number>>;
  /**
   * False when the input looks too garbled for us to trust that everything was
   * caught — the caller must ask the user rather than send automatically.
   */
  confident: boolean;
  /** Plain-language notes for the pre-flight screen. */
  warnings: string[];
}

const PLACEHOLDER: Record<SensitiveKind, string> = {
  ssn: "⟪SSN⟫",
  card: "⟪CARD⟫",
  routing: "⟪ROUTING⟫",
  account: "⟪ACCOUNT⟫",
  passport: "⟪PASSPORT⟫",
  license: "⟪LICENSE⟫",
  phone: "⟪PHONE⟫",
  email: "⟪EMAIL⟫",
  dob: "⟪DATE⟫",
  name: "⟪NAME⟫",
  address: "⟪ADDRESS⟫",
  secret: "⟪SECRET⟫",
};

// ---------------------------------------------------------------------------
// Checksums. Used to decide whether a digit run is a real identifier, so we
// don't blank every number on the page and destroy the layout signal.
// ---------------------------------------------------------------------------

/** Luhn — payment cards. */
function passesLuhn(digits: string): boolean {
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48;
    if (d < 0 || d > 9) return false;
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return sum % 10 === 0;
}

/** ABA routing checksum — US bank routing numbers. */
function passesAba(digits: string): boolean {
  if (digits.length !== 9) return false;
  const d = [...digits].map((c) => c.charCodeAt(0) - 48);
  if (d.some((n) => n < 0 || n > 9)) return false;
  const sum =
    3 * (d[0] + d[3] + d[6]) + 7 * (d[1] + d[4] + d[7]) + 1 * (d[2] + d[5] + d[8]);
  return sum % 10 === 0;
}

/**
 * SSNs the SSA never issues. Filtering these keeps obviously-fake sample numbers
 * from being treated as real, without ever risking a real one.
 */
function isImpossibleSsn(area: string, group: string, serial: string): boolean {
  return (
    area === "000" || area === "666" || area.startsWith("9") || group === "00" || serial === "0000"
  );
}

// ---------------------------------------------------------------------------
// Pattern rules
// ---------------------------------------------------------------------------

interface Rule {
  kind: SensitiveKind;
  pattern: RegExp;
  reason: string;
  /** Optional extra check — used where a checksum can confirm a real identifier. */
  verify?: (match: RegExpExecArray) => boolean;
}

/**
 * Ordered by specificity: the first rule to claim a stretch of text wins, so
 * that a card number isn't also reported as a generic account number.
 */
const RULES: Rule[] = [
  // Digit rules use digit-lookarounds rather than \b. OCR routinely runs labels
  // into values ("SSN541-88-2270"), and \b would find no boundary between the
  // letter and the digit — so the number would sail straight through.
  {
    kind: "ssn",
    pattern: /(?<!\d)(\d{3})[-\s](\d{2})[-\s](\d{4})(?!\d)/g,
    reason: "Nine digits in Social Security number format",
    verify: (m) => !isImpossibleSsn(m[1], m[2], m[3]),
  },
  {
    kind: "card",
    // 13–19 digits, optionally in groups. Confirmed by Luhn.
    pattern: /(?<!\d)(?:\d[ -]?){13,19}(?!\d)/g,
    reason: "Digit run that passes the payment-card checksum",
    verify: (m) => {
      const digits = m[0].replace(/\D/g, "");
      return digits.length >= 13 && digits.length <= 19 && passesLuhn(digits);
    },
  },
  {
    kind: "routing",
    pattern: /(?<!\d)\d{9}(?!\d)/g,
    reason: "Nine digits that pass the bank routing checksum",
    verify: (m) => passesAba(m[0]),
  },
  {
    kind: "passport",
    pattern: /\b[A-Z]{1,2}\d{6,9}\b/g,
    reason: "Passport-style identifier",
  },
  {
    kind: "license",
    // A VIN uniquely identifies a vehicle and, through it, its owner. 17
    // characters, and the standard excludes I, O and Q to avoid digit confusion
    // — which makes it distinctive enough to match without false positives.
    pattern: /\b[A-HJ-NPR-Z0-9]{17}\b/g,
    reason: "Vehicle identification number",
    verify: (m) => /\d/.test(m[0]) && /[A-HJ-NPR-Z]/.test(m[0]),
  },
  {
    kind: "email",
    pattern: /\b[\w.+-]+@[\w-]+\.[\w.-]+\b/g,
    reason: "Email address",
  },
  {
    kind: "phone",
    pattern: /\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g,
    reason: "Phone number",
  },
  {
    kind: "dob",
    pattern: /\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/g,
    reason: "Date — could be a date of birth",
  },
  {
    kind: "account",
    // Generic fallback: any long digit run not already claimed above.
    pattern: /(?<!\d)\d{8,}(?!\d)/g,
    reason: "Long digit sequence — treated as an account number",
  },
];

/**
 * Values that sit next to an identifying label. This is what catches names,
 * addresses and account numbers on forms and ID cards, where the number itself
 * has no distinctive shape but the label does.
 */
const LABELLED: Array<{ kind: SensitiveKind; label: RegExp; reason: string }> = [
  // Real documents almost never say "Name:". They say "Named Insured",
  // "Policyholder", "Beneficiary", "Account Holder". `name` is matched as a
  // substring rather than a whole word so "Named" and "Nombre" are caught too —
  // over-matching here costs a little accuracy, missing costs a real name.
  {
    kind: "name",
    label: /name|surname|holder|insured|beneficiary|applicant|patient|employee|owner|recipient/i,
    reason: "Value following a name label",
  },
  { kind: "address", label: /\b(?:address|street|residence|mailing)\b/i, reason: "Value following an address label" },
  { kind: "account", label: /\b(?:account|acct|policy|member|customer|reference)\s*(?:no|number|#)?\b/i, reason: "Value following an account label" },
  { kind: "license", label: /\b(?:license|licence|dl|driver'?s? licen[cs]e)\s*(?:no|number|#)?\b/i, reason: "Value following a licence label" },
  { kind: "dob", label: /\b(?:date of birth|dob|born|birth date)\b/i, reason: "Value following a date-of-birth label" },
  { kind: "secret", label: /\b(?:password|passcode|pin|secret|security code|cvv|access code)\b/i, reason: "Value following a credential label" },
];

function overlaps(spans: RedactionSpan[], start: number, end: number): boolean {
  return spans.some((s) => start < s.end && end > s.start);
}

/**
 * Is this line *only* a label, so the value must be on the line below?
 *
 * Without this check, a heading like "GEICO AUTOMOBILE POLICY DECLARATIONS"
 * counts as a "policy" label and swallows the entire next line. It fails safe,
 * but it destroys the document structure the classifier depends on — so a bare
 * label has to be almost nothing but the label itself.
 */
function isBareLabel(line: string): boolean {
  const trimmed = line.trim();
  const words = trimmed.split(/\s+/).filter(Boolean);
  // A real field label is short and wordless-ish: "Surname", "Given Names",
  // "Date of Birth". A heading like "GEICO AUTOMOBILE POLICY DECLARATIONS" is
  // longer and carries more words, and a line with digits already holds its
  // own value rather than pointing at one below.
  return trimmed.length <= 25 && words.length <= 3 && !/\d/.test(trimmed);
}

/**
 * Find the value that belongs to a label — the rest of the line after a colon,
 * or the following line on a form where the label sits above its value.
 */
function labelledSpans(text: string): RedactionSpan[] {
  const found: RedactionSpan[] = [];
  const lines = text.split(/\r?\n/);
  let offset = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const { kind, label, reason } of LABELLED) {
      if (!label.test(line)) continue;

      const colon = line.indexOf(":");
      if (colon !== -1 && line.slice(colon + 1).trim().length > 0) {
        const valueStart = offset + colon + 1;
        const trailing = line.length - (colon + 1) - line.slice(colon + 1).trimEnd().length;
        found.push({ start: valueStart, end: offset + line.length - trailing, kind, reason });
      } else if (isBareLabel(line) && i + 1 < lines.length && lines[i + 1].trim().length > 0) {
        // Label on its own line, value beneath — common on ID cards.
        const nextStart = offset + line.length + 1;
        found.push({ start: nextStart, end: nextStart + lines[i + 1].trimEnd().length, kind, reason });
      }
    }
    offset += line.length + 1;
  }
  return found;
}

/**
 * How readable the OCR output looks. Heavy garbling means patterns may have been
 * broken up and missed, so the caller must not auto-send.
 */
function looksGarbled(text: string): boolean {
  if (text.trim().length < 20) return true;
  const letters = (text.match(/[A-Za-z]/g) ?? []).length;
  const junk = (text.match(/[^\w\s.,:;/#'"()&+@-]/g) ?? []).length;
  return letters / Math.max(text.length, 1) < 0.35 || junk / Math.max(text.length, 1) > 0.15;
}

/**
 * Produce a transmittable copy of `text` with every sensitive value replaced by
 * a typed placeholder.
 *
 * The input is never modified. Callers seal the original and send only
 * `sanitized`, and must honour `confident === false` by asking the user first.
 */
export function redactText(text: string): RedactionResult {
  const spans: RedactionSpan[] = [];

  // Label-driven first: it is the most context-aware, and claiming a span here
  // stops a weaker pattern rule from re-labelling the same text less accurately.
  for (const span of labelledSpans(text)) {
    if (!overlaps(spans, span.start, span.end)) spans.push(span);
  }

  for (const rule of RULES) {
    rule.pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = rule.pattern.exec(text)) !== null) {
      if (match[0].length === 0) {
        rule.pattern.lastIndex++;
        continue;
      }
      const start = match.index;
      const end = start + match[0].length;
      if (overlaps(spans, start, end)) continue;
      if (rule.verify && !rule.verify(match)) continue;
      spans.push({ start, end, kind: rule.kind, reason: rule.reason });
    }
  }

  spans.sort((a, b) => a.start - b.start);

  let sanitized = "";
  let cursor = 0;
  const counts: Partial<Record<SensitiveKind, number>> = {};
  for (const span of spans) {
    sanitized += text.slice(cursor, span.start) + PLACEHOLDER[span.kind];
    counts[span.kind] = (counts[span.kind] ?? 0) + 1;
    cursor = span.end;
  }
  sanitized += text.slice(cursor);

  const warnings: string[] = [];
  const garbled = looksGarbled(text);
  if (garbled) {
    warnings.push(
      "This scan was hard to read, so we can't be sure every sensitive detail was found. Check before sending it, or file this one by hand.",
    );
  }
  if (spans.length === 0 && text.trim().length > 0) {
    warnings.push(
      "Nothing here was recognised as sensitive. That may simply be true of this document.",
    );
  }

  // Confidence is about whether the text could be READ, not about whether it
  // happened to contain secrets. A clean page with nothing sensitive on it is a
  // perfectly confident result — treating it as suspect would block ordinary
  // documents from ever being sorted, which is the thing this exists to enable.
  // `looksGarbled` is the real safety gate.
  return { sanitized, spans, counts, confident: !garbled, warnings };
}

/**
 * Pixel regions to black out on the image itself, derived from OCR word boxes.
 *
 * Redacting the text is not enough when the image is what gets sent: the number
 * is still legible in the picture. This maps the character spans back onto the
 * page so the caller can paint over them before transmitting.
 */
export interface OcrWord {
  text: string;
  /** Character offset of this word within the OCR text. */
  start: number;
  box: { x: number; y: number; width: number; height: number };
}

export function redactionBoxes(words: OcrWord[], spans: RedactionSpan[]): OcrWord["box"][] {
  const boxes: OcrWord["box"][] = [];
  for (const word of words) {
    const end = word.start + word.text.length;
    // Any overlap at all means the word carries part of a secret — black it out
    // whole rather than trying to mask individual characters.
    if (spans.some((s) => word.start < s.end && end > s.start)) boxes.push(word.box);
  }
  return boxes;
}

/**
 * Final check immediately before anything is transmitted.
 *
 * The redactor has already run, so this should never fire. It exists because a
 * bug up there would otherwise be silent and irreversible — a secret on the wire
 * cannot be recalled. Cheap, and it fails closed.
 */
export function assertRedacted(sanitized: string): void {
  const checks: Array<[RegExp, string]> = [
    [/(?<!\d)\d{3}[-\s]\d{2}[-\s]\d{4}(?!\d)/, "a Social Security number"],
    [/(?<!\d)\d{13,19}(?!\d)/, "a long card-like number"],
    [/(?<!\d)\d{8,}(?!\d)/, "a long account-like number"],
  ];
  for (const [pattern, what] of checks) {
    if (pattern.test(sanitized)) {
      throw new Error(`Refusing to send: what looks like ${what} survived redaction.`);
    }
  }
}

/** One-line summary for the consent screen: "3 account numbers, 1 SSN, 2 names". */
export function describeRedactions(result: RedactionResult): string {
  const label: Record<SensitiveKind, [string, string]> = {
    ssn: ["Social Security number", "Social Security numbers"],
    card: ["card number", "card numbers"],
    routing: ["routing number", "routing numbers"],
    account: ["account number", "account numbers"],
    passport: ["passport number", "passport numbers"],
    license: ["licence number", "licence numbers"],
    phone: ["phone number", "phone numbers"],
    email: ["email address", "email addresses"],
    dob: ["date", "dates"],
    name: ["name", "names"],
    address: ["address", "addresses"],
    secret: ["password or PIN", "passwords or PINs"],
  };

  const parts = (Object.entries(result.counts) as Array<[SensitiveKind, number]>)
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([kind, n]) => `${n} ${label[kind][n === 1 ? 0 : 1]}`);

  return parts.length === 0 ? "Nothing sensitive found" : `Hidden: ${parts.join(", ")}`;
}
