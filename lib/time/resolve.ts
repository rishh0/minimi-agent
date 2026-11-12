import * as chrono from "chrono-node";

// Turns date phrases in a user message ("last Tuesday", "since Monday", "on 3 November")
// into exact date ranges in the USER's timezone. Code does the date math, not the LLM:
// models are unreliable at calendar arithmetic, and these ranges become database queries.

export type DateRef = {
  text: string; // the phrase as the user wrote it, e.g. "since Monday"
  label: string; // human-readable, e.g. "Mon 9 Nov 2026 → today (Thu 12 Nov 2026)"
  startDate: string; // YYYY-MM-DD, user's local calendar day (inclusive)
  endDate: string; // YYYY-MM-DD, inclusive
  startUtc: string; // ISO instant of local midnight at startDate
  endUtc: string; // ISO instant of local midnight AFTER endDate (exclusive)
};

type YMD = { y: number; m: number; d: number };

export function resolveDates(message: string, at: Date, timeZone: string): DateRef[] {
  const today = localDay(at, timeZone);
  // chrono applies its timezone option to explicit dates but computes relative ones
  // ("yesterday") in the SERVER's timezone. So we hand it a reference Date whose
  // server-local fields equal the user's wall clock, and only read calendar days back.
  const p = parts(at, timeZone);
  const wallClock = new Date(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  const results = chrono.parse(message, wallClock);
  const refs: DateRef[] = [];

  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    const before = message.slice(0, r.index).toLowerCase().trimEnd();
    let text = r.text;
    let start = componentsToDay(r.start);
    let end = r.end ? componentsToDay(r.end) : start;

    // "last week" / "this week" → the whole calendar week (Mon–Sun), not one day.
    if (/\bweek\b/i.test(r.text)) {
      const monday = addDays(today, -((weekday(today) + 6) % 7));
      if (/\b(last|past|previous)\b/i.test(r.text)) {
        start = addDays(monday, -7);
        end = addDays(monday, -1);
      } else {
        start = monday;
        end = today;
      }
    }

    // "between 1 Nov and 5 Nov" / "from 1 Nov to 5 Nov" → one range.
    const next = results[i + 1];
    const gap = next ? message.slice(r.index + r.text.length, next.index).trim().toLowerCase() : "";
    if (next && /\b(between|from)$/.test(before) && /^(and|to|until|-)$/.test(gap)) {
      end = componentsToDay(next.start);
      text = message.slice(r.index, next.index + next.text.length);
      i++; // consumed the next result
    }

    // "since Monday" / "after 3 Nov" → that day through today.
    const since = /\b(since|after)$/.test(before);
    if (since) {
      end = today;
      text = message.slice(before.length, r.index + r.text.length).trim();
    }

    const label =
      sameDay(start, end) ? fmt(start) : `${fmt(start)} → ${sameDay(end, today) ? `today (${fmt(end)})` : fmt(end)}`;
    refs.push({
      text,
      label,
      startDate: iso(start),
      endDate: iso(end),
      startUtc: zonedMidnightUtc(start, timeZone).toISOString(),
      endUtc: zonedMidnightUtc(addDays(end, 1), timeZone).toISOString(),
    });
  }
  // "What did I ask on 3 Nov — is it still correct today?": "today" refers to the present,
  // not a period to look up. Drop today-only refs when the message also names another date.
  const isTodayOnly = (r: DateRef) => r.startDate === iso(today) && r.endDate === iso(today);
  return refs.some((r) => !isTodayOnly(r)) ? refs.filter((r) => !isTodayOnly(r)) : refs;
}

// "Thursday, 12 November 2026, 15:30" in the user's timezone.
export function formatNow(at: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(at);
}

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

// ---- small calendar helpers (dates as plain {y, m, d}, no timezone attached) ----

function componentsToDay(c: chrono.ParsedComponents): YMD {
  return { y: c.get("year")!, m: c.get("month")!, d: c.get("day")! };
}

function localDay(at: Date, timeZone: string): YMD {
  const p = parts(at, timeZone);
  return { y: p.year, m: p.month, d: p.day };
}

function addDays(day: YMD, n: number): YMD {
  const t = new Date(Date.UTC(day.y, day.m - 1, day.d + n));
  return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() };
}

const weekday = (day: YMD) => new Date(Date.UTC(day.y, day.m - 1, day.d)).getUTCDay(); // 0 = Sunday
const sameDay = (a: YMD, b: YMD) => a.y === b.y && a.m === b.m && a.d === b.d;
const iso = (day: YMD) => `${day.y}-${String(day.m).padStart(2, "0")}-${String(day.d).padStart(2, "0")}`;
const fmt = (day: YMD) =>
  new Date(Date.UTC(day.y, day.m - 1, day.d)).toLocaleDateString("en-GB", {
    timeZone: "UTC",
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });

function parts(at: Date, timeZone: string) {
  const out: Record<string, number> = {};
  for (const p of new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
  }).formatToParts(at)) {
    if (p.type !== "literal") out[p.type] = Number(p.value);
  }
  return out as { year: number; month: number; day: number; hour: number; minute: number; second: number };
}

// The UTC instant at which a calendar day starts in `timeZone` (DST-safe:
// the offset is measured at the guessed instant, then re-checked).
function zonedMidnightUtc(day: YMD, timeZone: string): Date {
  const guess = Date.UTC(day.y, day.m - 1, day.d);
  const offsetAt = (t: number) => {
    const p = parts(new Date(t), timeZone);
    return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - t;
  };
  let t = guess - offsetAt(guess);
  t = guess - offsetAt(t);
  return new Date(t);
}
