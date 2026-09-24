/**
 * Checking a DEA registration number.
 *
 * A DEA number is two letters then seven digits, and the last digit is a check
 * digit: add the 1st, 3rd and 5th digits, add twice the 2nd, 4th and 6th, and
 * the ones digit of the total is the 7th. A transposed pair or a mistyped digit
 * almost always breaks it.
 *
 * That matters more here than it looks. The number is what ties a body of
 * records to a registrant, and a typo is discovered at the worst possible
 * moment — when someone asks which registration a log was kept under and the
 * answer doesn't match anything.
 *
 * This WARNS rather than refuses. The letter rules have changed over the years
 * and vary by registrant type, and being unable to record a real number
 * because a checker disagrees is worse than recording one that looks odd.
 */

export interface DeaNumberCheck {
  formatted: string;
  wellFormed: boolean;
  checkDigitValid: boolean;
  /** Plain-language reason, or null when nothing looks wrong. */
  problem: string | null;
}

const SHAPE = /^([A-Za-z]{2})(\d{7})$/;

export function checkDeaNumber(input: string): DeaNumberCheck {
  const raw = (input ?? "").replace(/[\s-]/g, "").toUpperCase();
  const m = SHAPE.exec(raw);

  if (!m) {
    return {
      formatted: raw,
      wellFormed: false,
      checkDigitValid: false,
      problem: raw.length === 0 ? null : "A DEA number is two letters followed by seven digits.",
    };
  }

  const digits = m[2].split("").map(Number);
  const odd = digits[0] + digits[2] + digits[4];
  const even = digits[1] + digits[3] + digits[5];
  const expected = (odd + even * 2) % 10;
  const checkDigitValid = expected === digits[6];

  return {
    formatted: raw,
    wellFormed: true,
    checkDigitValid,
    problem: checkDigitValid ? null : "That doesn't pass the DEA check digit — worth re-reading off the certificate.",
  };
}

/** Display form: letters, then the digits. */
export function formatDeaNumber(input: string): string {
  return (input ?? "").replace(/[\s-]/g, "").toUpperCase();
}
