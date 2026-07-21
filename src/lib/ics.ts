// Dependency-free iCalendar (.ics) builder for exporting compliance deadlines.
//
// Produces a VCALENDAR string with one all-day VEVENT per event. Kept pure:
// callers pass a `stamp` (DTSTAMP) so the helper never reads the clock itself.

export type IcsEvent = {
  /** Stable unique identifier for the event (becomes the UID). */
  uid: string;
  /** Human-readable summary line. */
  title: string;
  /** Event date as `YYYY-MM-DD` (all-day). */
  date: string;
  /** Optional longer description. */
  description?: string;
};

// Escape a value for an iCalendar TEXT property per RFC 5545: backslashes,
// commas, semicolons, and newlines must be escaped.
function escapeText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\n|\r/g, "\\n");
}

// Turn `YYYY-MM-DD` (or an already-compact `YYYYMMDD`) into compact date digits.
function toDateDigits(date: string): string {
  return date.replace(/-/g, "").slice(0, 8);
}

// Given compact `YYYYMMDD`, return the next day's compact digits. Uses UTC to
// avoid any local-timezone drift when advancing the day.
function nextDayDigits(digits: string): string {
  const year = Number(digits.slice(0, 4));
  const month = Number(digits.slice(4, 6));
  const day = Number(digits.slice(6, 8));
  const d = new Date(Date.UTC(year, month - 1, day));
  d.setUTCDate(d.getUTCDate() + 1);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${y}${m}${dd}`;
}

/**
 * Build a valid VCALENDAR string from a list of all-day compliance events.
 *
 * @param events One VEVENT is emitted per entry, as an all-day event.
 * @param stamp  DTSTAMP value in iCalendar UTC form (`YYYYMMDDTHHMMSSZ`).
 *               Pass e.g. `new Date().toISOString()` from the caller and it
 *               will be normalized; kept as a param so this helper stays pure.
 */
export function buildIcs(events: IcsEvent[], stamp: string): string {
  const dtstamp = stamp.replace(/[-:]/g, "").replace(/\.\d{3}/, "").slice(0, 15) + "Z";

  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Lone Peak Compliance Hub//Compliance Calendar//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
  ];

  for (const e of events) {
    const start = toDateDigits(e.date);
    if (start.length !== 8) continue; // skip malformed dates
    const end = nextDayDigits(start);
    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${escapeText(e.uid)}`);
    lines.push(`DTSTAMP:${dtstamp}`);
    lines.push(`DTSTART;VALUE=DATE:${start}`);
    lines.push(`DTEND;VALUE=DATE:${end}`);
    lines.push(`SUMMARY:${escapeText(e.title)}`);
    if (e.description) {
      lines.push(`DESCRIPTION:${escapeText(e.description)}`);
    }
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");
  // iCalendar lines are CRLF-delimited.
  return lines.join("\r\n") + "\r\n";
}
