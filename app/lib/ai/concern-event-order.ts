import type { ActiveConcernMessageState, ConcernTransitionEvidence } from "./turn-classifier.ts";

type EventTime = { axis: string; value: number };

// These are source-supported day buckets, not invented timestamps. In particular,
// two events on the same day and undated competing events remain unordered.
function eventTime(text: string): EventTime | null {
  if (/\b(?:now|currently|at present|at the moment)\b/i.test(text)) return { axis: "current", value: 0 };
  if (/\btoday\b/i.test(text)) return { axis: "relative", value: 0 };
  if (/\byesterday\b/i.test(text)) return { axis: "relative", value: -1 };
  if (/\blast night\b/i.test(text)) return { axis: "relative", value: -0.5 };
  if (/\b(?:this morning|after breakfast)\b/i.test(text)) return { axis: "relative", value: -0.1 };
  const ago = /\b(\d+) days? ago\b/i.exec(text);
  if (ago) return { axis: "relative", value: -Number(ago[1]) };
  const iso = /\b(\d{4})-(\d{2})-(\d{2})\b/.exec(text);
  const named = /\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?\s+(\d{1,2})(?:,?\s+(\d{4}))?\b/i.exec(text);
  const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
  if (iso || named) {
    const year = iso ? Number(iso[1]) : named?.[3] ? Number(named[3]) : 2000;
    const month = iso ? Number(iso[2]) - 1 : months.indexOf(named![1].slice(0, 3).toLowerCase());
    const day = Number(iso ? iso[3] : named![2]);
    const date = new Date(Date.UTC(year, month, day));
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month || date.getUTCDate() !== day) return null;
    // Missing years can compare days within a month, not infer a year rollover.
    return { axis: iso || named?.[3] ? "calendar" : `month-${month}`, value: date.valueOf() };
  }
  return null;
}

function recovery(state: ConcernTransitionEvidence["state"]) { return state === "resolved" || state === "improved"; }

export function decideConcernTransitionState(events: ConcernTransitionEvidence[]): ActiveConcernMessageState {
  if (!events.length) return "unrelated";
  const positive = events.filter((event) => recovery(event.state));
  const competing = events.filter((event) => !recovery(event.state));
  if (!positive.length) return events.some((event) => event.isCertain && event.state === "recurrence") ? "recurrence"
    : events.some((event) => event.isCertain) ? "still_active" : "unclear";
  if (!positive.some((event) => event.isCertain)) return "unclear";
  if (!competing.length) return positive.every((event) => event.isCertain)
    ? positive.every((event) => event.state === "resolved") ? "resolved" : "improved" : "unclear";
  const later = (a: ConcernTransitionEvidence, b: ConcernTransitionEvidence) => {
    const at = eventTime(a.evidence), bt = eventTime(b.evidence);
    if (!at || !bt) return false;
    if (at.axis === bt.axis) return at.value > bt.value;
    return at.axis === "current" && bt.axis !== "current";
  };
  const terminal = positive.find((event) => event.isCertain && competing.every((other) => other.isCertain && later(event, other)));
  if (terminal) return terminal.state;
  const active = competing.find((event) => event.isCertain && positive.every((other) => later(event, other)));
  return active?.state || "unclear";
}
