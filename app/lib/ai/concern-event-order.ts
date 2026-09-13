import type { ActiveConcernMessageState, ConcernTransitionEvidence } from "./turn-classifier.ts";

const DAY = 86_400_000;
type Interval = { start: number; end: number };
type EventTime = { kind: "interval"; interval: Interval; current: boolean; axis: string }
  | { kind: "unmarked" } | { kind: "unsupported" };
const monthNames = "Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?";
const temporalSurface = new RegExp(`\\b(?:now|currently|at present|at the moment|today|yesterday|this morning|this afternoon|this evening|last night|after breakfast|last year|(?:a|an|one|\\d+) (?:day|week|month|year)s? ago|this week|this month|last week|last month|\\d{4}-\\d{2}-\\d{2}|(?:${monthNames})\\.?\\s+\\d{1,2}(?:,?\\s+\\d{4})?|(?:in|during)\\s+\\d{4})\\b`, "gi");

// Bounds, not representative points: today contains this morning. No ordering
// is inferred from text position or an unsupported temporal expression.
function eventTime(text: string, now: Date): EventTime {
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const matches = [...text.matchAll(temporalSurface)];
  const remainder = text.replace(temporalSurface, " ");
  if (/\b(?:ago|last|previous(?:ly)?|earlier|before|when|in the past|used to|back in|back then|at that time|at age|some time|sometime|once\s+(?:stopped|ceased|resolved|recovered))\b/i.test(remainder)) return { kind: "unsupported" };
  if (/\b(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|\d{4})\b/i.test(remainder)
    || new RegExp(`\\b(?:${monthNames})\\b`, "i").test(remainder)) return { kind: "unsupported" };
  if (!matches.length) return { kind: "unmarked" };
  const intervals: Interval[] = [];
  const axes = new Set<string>();
  let current = false;
  for (const match of matches) {
    const surface = match[0].toLowerCase();
    const days = (start: number, end: number): Interval => ({ start: today + start * DAY, end: today + end * DAY });
    let interval: Interval | null = null;
    let axis = "calendar";
    if (/^(?:now|currently|at present|at the moment)$/.test(surface)) { interval = days(0, 1); current = true; }
    else if (surface === "today" || surface === "after breakfast") interval = days(0, 1);
    else if (surface === "yesterday") interval = days(-1, 0);
    else if (surface === "last night") interval = days(-0.25, 0);
    else if (surface === "this morning") interval = days(0, 0.5);
    else if (surface === "this afternoon") interval = days(0.5, 0.75);
    else if (surface === "this evening") interval = days(0.75, 1);
    else if (surface === "last year") interval = { start: Date.UTC(now.getUTCFullYear() - 1, 0, 1), end: Date.UTC(now.getUTCFullYear(), 0, 1) };
    else {
      const ago = /^(a|an|one|\d+) (day|week|month|year)s? ago$/.exec(surface);
      const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(surface);
      const named = new RegExp(`^(${monthNames})\\.?\\s+(\\d{1,2})(?:,?\\s+(\\d{4}))?$`, "i").exec(surface);
      const yearOnly = /^(?:in|during)\s+(\d{4})$/.exec(surface);
      if (ago && ago[2] === "day") {
        const amount = /^(?:a|an|one)$/.test(ago[1]) ? 1 : Number(ago[1]);
        interval = days(-amount, 1 - amount);
      } else if (ago && ago[2] === "year") {
        const year = now.getUTCFullYear() - (/^(?:a|an|one)$/.test(ago[1]) ? 1 : Number(ago[1]));
        interval = { start: Date.UTC(year, 0, 1), end: Date.UTC(year + 1, 0, 1) };
      } else if (yearOnly) {
        const year = Number(yearOnly[1]);
        interval = { start: Date.UTC(year, 0, 1), end: Date.UTC(year + 1, 0, 1) };
      } else if (iso || named) {
        const year = iso ? Number(iso[1]) : named?.[3] ? Number(named[3]) : now.getUTCFullYear();
        const month = iso ? Number(iso[2]) - 1 : ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"].indexOf(named![1].slice(0, 3).toLowerCase());
        const day = Number(iso ? iso[3] : named![2]);
        // A yearless date can order days within its month; it cannot establish
        // a cross-month/year relationship merely by borrowing the server year.
        if (named && !named[3]) axis = `month-${month}`;
        const start = Date.UTC(year, month, day);
        const date = new Date(start);
        if (date.getUTCFullYear() === year && date.getUTCMonth() === month && date.getUTCDate() === day) interval = { start, end: start + DAY };
      }
    }
    if (!interval) return { kind: "unsupported" };
    intervals.push(interval);
    axes.add(axis);
  }
  // Nested descriptions can narrow an interval; incompatible ones cannot.
  const start = Math.max(...intervals.map((item) => item.start));
  const end = Math.min(...intervals.map((item) => item.end));
  return start < end && axes.size === 1
    ? { kind: "interval", interval: { start, end }, current, axis: [...axes][0] } : { kind: "unsupported" };
}

function recovery(state: ConcernTransitionEvidence["state"]) { return state === "resolved" || state === "improved"; }

export function decideConcernTransitionState(events: ConcernTransitionEvidence[], options: {
  openedAt?: string | null; requireCurrentConcern?: boolean; now?: Date;
} = {}): ActiveConcernMessageState {
  if (!events.length) return "unrelated";
  const now = options.now || new Date();
  const times = new Map(events.map((event) => [event, eventTime(event.evidence, now)]));
  const applicable = (event: ConcernTransitionEvidence) => {
    const time = times.get(event)!;
    if (time.kind === "unsupported") return false;
    // Unqualified current updates remain useful, but explicit history needs an
    // interval compatible with the actual concern, even without competitors.
    if (time.kind === "unmarked") return true;
    if (time.interval.start > now.valueOf()) return false;
    if (!options.requireCurrentConcern) return true;
    const opened = options.openedAt ? Date.parse(options.openedAt) : NaN;
    if (time.axis !== "calendar" && (!Number.isFinite(opened) || new Date(opened).getUTCFullYear() !== now.getUTCFullYear())) return false;
    if (time.current) return !Number.isFinite(opened) || opened <= now.valueOf();
    if (Number.isFinite(opened)) return time.interval.start >= opened;
    const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    return time.interval.start >= today;
  };
  const positive = events.filter((event) => recovery(event.state));
  const competing = events.filter((event) => !recovery(event.state));
  if (!positive.length) return events.some((event) => event.isCertain && event.state === "recurrence") ? "recurrence"
    : events.some((event) => event.isCertain) ? "still_active" : "unclear";
  const candidates = positive.filter((event) => event.isCertain && applicable(event));
  if (!candidates.length) return "unclear";
  if (!competing.length) return positive.every((event) => event.isCertain)
    ? candidates.every((event) => event.state === "resolved") ? "resolved" : "improved" : "unclear";
  const later = (a: ConcernTransitionEvidence, b: ConcernTransitionEvidence) => {
    const at = times.get(a)!, bt = times.get(b)!;
    return at.kind === "interval" && bt.kind === "interval" && at.axis === bt.axis && at.interval.start >= bt.interval.end;
  };
  const terminal = candidates.find((event) => competing.every((other) => other.isCertain && later(event, other)));
  if (terminal) return terminal.state;
  const active = competing.find((event) => event.isCertain && positive.every((other) => later(event, other)));
  return active?.state || "unclear";
}
