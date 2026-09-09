import { parsePlainTable } from "../lib/plain-table";

/** Preserve source punctuation. Table cells are escaped text, not HTML/Markdown. */
export function AskAnswerText({ text, afterHeading = false }: { text: string; afterHeading?: boolean }) {
  return <div className={`${afterHeading ? "mt-1.5 " : ""}space-y-3 [overflow-wrap:anywhere] text-[1.05rem] leading-7 text-[var(--pw-text)]`}>
    {text.split(/\n\s*\n/).filter(Boolean).map((paragraph, index) => {
      const table = parsePlainTable(paragraph);
      const bulletLines = paragraph.trim().split(/\r?\n/);
      if (!table && bulletLines.length && bulletLines.every(line => /^\s*[-*•]\s+\S/.test(line))) {
        return <ul className="list-disc space-y-1 pl-6" key={index}>
          {bulletLines.map((line, i) => <li className="whitespace-pre-wrap" key={i}>{line.replace(/^\s*[-*•]\s+/, "")}</li>)}
        </ul>;
      }
      if (!table) return <p className="whitespace-pre-wrap" key={index}>{paragraph}</p>;
      return <div className="overflow-x-auto" key={index}>
        <table className="w-full border-collapse text-left text-sm">
          <thead><tr>{table.headers.map((cell, i) => <th className="border-b px-3 py-2 font-semibold" scope="col" key={i}>{cell}</th>)}</tr></thead>
          <tbody>{table.rows.map((row, i) => <tr key={i}>{row.map((cell, j) => <td className="border-b px-3 py-2 align-top" key={j}>{cell}</td>)}</tr>)}</tbody>
        </table>
      </div>;
    })}
  </div>;
}
