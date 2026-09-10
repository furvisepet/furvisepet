import { splitAskTextBlocks, type AskTextBlock, parsePlainTable } from "../lib/furvise-output";

/** Preserve source punctuation. Table cells are escaped text, not HTML/Markdown. */
export function AskAnswerText({ text, afterHeading = false }: { text: string; afterHeading?: boolean }) {
  return <div className={`${afterHeading ? "mt-1.5 " : ""}space-y-3 [overflow-wrap:anywhere] text-[1.05rem] leading-7 text-[var(--pw-text)]`}>
    {splitAskTextBlocks(text).flatMap<AskTextBlock>(block => block.kind === "code" ? [block] : block.text.split(/\n\s*\n/).filter(Boolean).map(text => ({kind:"prose" as const,text}))).map((block, index) => {
      if (block.kind === "code") return <pre key={index} className="overflow-x-auto rounded-lg bg-black/5 p-3 text-sm leading-6"><code>{block.text}</code></pre>;
      const paragraph = block.text;
      const table = parsePlainTable(paragraph);
      const bulletLines = paragraph.trim().split(/\r?\n/);
      if (!table && bulletLines.length && bulletLines.every(line => /^\s*[-*•]\s+\S/.test(line))) {
        return <ul className="list-disc space-y-1 pl-6" key={index}>
          {bulletLines.map((line, i) => <li className="whitespace-pre-wrap" key={i}>{line.replace(/^\s*[-*•]\s+/, "")}</li>)}
        </ul>;
      }
      if (!table) return <p className="whitespace-pre-wrap" key={index}>{inlineText(paragraph)}</p>;
      return <div className="overflow-x-auto" key={index}>
        <table className="w-full border-collapse text-left text-sm">
          <thead><tr>{table.headers.map((cell, i) => <th className="border-b px-3 py-2 font-semibold" scope="col" key={i}>{cell}</th>)}</tr></thead>
          <tbody>{table.rows.map((row, i) => <tr key={i}>{row.map((cell, j) => <td className="border-b px-3 py-2 align-top" key={j}>{cell}</td>)}</tr>)}</tbody>
        </table>
      </div>;
    })}
  </div>;
}

function inlineText(text: string) {
  return text.split(/(`[^`\n]+`|\*\*[^*\n]+\*\*)/g).map((part, index) =>
    part.startsWith("`") && part.endsWith("`") ? <code className="rounded bg-black/5 px-1 font-mono text-[0.9em]" key={index}>{part.slice(1,-1)}</code>
    : part.startsWith("**") && part.endsWith("**") ? <strong key={index}>{part.slice(2,-2)}</strong> : part);
}
