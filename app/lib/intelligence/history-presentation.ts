import { parsePlainTable } from "../plain-table.ts";

/** Layout changes only: no factual paraphrase, truncation, duplication or reordering. */
type Layout = { style: "paragraph" | "bullets" | "numbered"; count?: number };
const counts: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8 };

export function requestedHistoryLayout(question: string): Layout | null {
  // Only presentation vocabulary is recognized; episode/note quantities are not.
  // Quoted examples are data, not formatting commands.
  const text = question.replace(/"[^"]*"|\u201c[^\u201d]*\u201d/g, "");
  const expression = /\b(?:(no|without)\s+(?:bullets?|lists?)|(one|a single)\s+paragraph|(?:numbered|ordered)\s+list|(?:in|into|as|use|give me|make it)\s+(?:(?:exactly|precisely)\s+)?(?:(?:a|an)\s+)?(?:(one|two|three|four|five|six|seven|eight|[1-8])\s+)?(?:(?:short|concise|brief)\s+)?(?:bullet\s+points?|bullets?|points|paragraphs?)|bullet\s+points)\b/gi;
  let layout: Layout | null = null;
  for (const match of text.matchAll(expression)) {
    const value = match[0].toLowerCase();
    if (match[1] || match[2]) layout = { style: "paragraph", count: 1 };
    else if (/numbered|ordered/.test(value)) layout = { style: "numbered" };
    else {
      const token = match[3]?.toLowerCase();
      layout = { style: /paragraph/.test(value) ? "paragraph" : "bullets",
        ...(token ? { count: counts[token] || Number(token) } : {}) };
    }
  }
  return layout;
}

export function stripHistoryBullet(text: string): string {
  return text.replace(/^\s*(?:[-]\s+(?=[A-Za-z])|[*\u2022]\s+)/, "").trim();
}

export function presentReviewedHistory(sentences: readonly string[], question: string): string {
  if (!sentences.length) return "";
  const table = sentences.join("\n");
  if (parsePlainTable(table)) return table;
  const layout = requestedHistoryLayout(question);
  const groups: string[][] = [];
  if (layout?.count) {
    // Never invent points to meet a requested count. Keep every retained sentence.
    const count = Math.min(layout.count, sentences.length);
    for (let i = 0; i < count; i++) {
      const start = Math.floor(i * sentences.length / count);
      const end = Math.floor((i + 1) * sentences.length / count);
      groups.push(sentences.slice(start, end));
    }
  } else if (layout?.style === "bullets" || layout?.style === "numbered") {
    for (const sentence of sentences) groups.push([sentence]);
  } else {
    // Longer prose remains readable without splitting a sentence or its numbers.
    for (const sentence of sentences) {
      const last = groups.at(-1);
      if (!last || last.join(" ").length + sentence.length + 1 > 420) groups.push([sentence]);
      else last.push(sentence);
    }
  }
  return groups.map((group, i) =>
    (layout?.style === "bullets" ? "- " : layout?.style === "numbered" ? (i + 1) + ". " : "") + group.join(" ")
  ).join(layout?.style === "bullets" || layout?.style === "numbered" ? "\n" : "\n\n");
}

/** Restore whitespace only when downstream safety/sanitation left every token intact. */
export function preserveReviewedLayout(reviewed: string, sanitized: string): string {
  const normalize = (text: string) => text.replace(/\s+/g, " ").trim();
  return normalize(reviewed) === normalize(sanitized) ? reviewed : sanitized;
}
