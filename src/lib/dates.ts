import {
  differenceInCalendarDays,
  format,
  isValid,
  parseISO,
} from "date-fns";

/**
 * Safe date utilities. The original app crashed on `new Date(maybeUndefined)`
 * and did raw millisecond math that drifted across DST. Everything here guards
 * against null/invalid input and uses calendar-day differences.
 */

/** Parse an ISO string (or Date) into a valid Date, or null. Never throws. */
export function parseDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  const d = value instanceof Date ? value : parseISO(value);
  return isValid(d) ? d : null;
}

/** Format a date safely; returns the fallback when the input is missing/invalid. */
export function formatDate(
  value: string | Date | null | undefined,
  fmt = "MMM d, yyyy",
  fallback = "—",
): string {
  const d = parseDate(value);
  return d ? format(d, fmt) : fallback;
}

/** Whole calendar days from today until `value` (negative if in the past). */
export function daysUntil(value: string | Date | null | undefined): number | null {
  const d = parseDate(value);
  return d ? differenceInCalendarDays(d, new Date()) : null;
}

/** True when `value` is a valid date strictly before today. */
export function isExpired(value: string | Date | null | undefined): boolean {
  const days = daysUntil(value);
  return days !== null && days < 0;
}

/** True when `value` falls within the next `within` days (inclusive), not past. */
export function isExpiringSoon(
  value: string | Date | null | undefined,
  within = 30,
): boolean {
  const days = daysUntil(value);
  return days !== null && days >= 0 && days <= within;
}

/** Convert a date-only input (yyyy-MM-dd) to a UTC ISO string to avoid TZ drift. */
export function dateInputToISO(input: string): string | null {
  if (!input) return null;
  const d = parseISO(`${input}T00:00:00Z`);
  return isValid(d) ? d.toISOString() : null;
}
