import {parseCsvRecords,parsePlainTable,isStructuredHistoryText} from "../furvise-output.ts";

/** Presentation validation only; this grants no factual authority. */
export function matchesHistoryOutputFormat(text: string, format?: string | null): boolean {
  if (format === "csv") return parseCsvRecords(text) !== null;
  if (format === "json") return isStructuredHistoryText(text);
  if (!format || format === "prose") {
    const body = text.trim().replace(/^```(?:json)?\s*\n([\s\S]*?)\n```$/i, "$1");
    return !isStructuredHistoryText(body);
  }
  if (format === "table") return !!parsePlainTable(text);
  if (format === "bullets") return text.trim().split(/\r?\n/).every(line => /^\s*[-*•]\s+\S/.test(line));
  return true;
}
