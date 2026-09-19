import { splitAskPresentationBlocks, parsePlainTable } from "../lib/furvise-output";

/** Preserve source punctuation. Table cells are escaped text, not HTML/Markdown. */
export function AskAnswerText({ text, afterHeading = false }: { text: string; afterHeading?: boolean }) {
  return <div className={`${afterHeading ? "mt-1.5 " : ""}space-y-3 [overflow-wrap:anywhere] text-[1.05rem] leading-7 text-[var(--pw-text)]`}>
    {splitAskPresentationBlocks(text).map((block, index) => {
      if (block.kind === "code") return <pre key={index} className="overflow-x-auto rounded-lg bg-black/5 p-3 text-sm leading-6"><code>{block.text}</code></pre>;
      const paragraph = block.text;
      const table = parsePlainTable(paragraph);
      const comparison = !table ? parseComparisonRows(paragraph) : null;
      if (comparison) {
        return <div className="overflow-hidden rounded-xl border border-[var(--assistant-response-border)] bg-[var(--surface-primary)]" data-ui="ask-comparison-grid" key={index}>
          <div className="hidden overflow-x-auto sm:block">
            <table className="w-full border-collapse text-left text-sm">
              <thead className="bg-black/[0.025]"><tr><th className="px-3 py-2.5 font-semibold">Pet</th><th className="px-3 py-2.5 font-semibold">Earliest</th><th className="px-3 py-2.5 font-semibold">Latest</th><th className="px-3 py-2.5 text-right font-semibold">Change</th></tr></thead>
              <tbody>{comparison.map((row, rowIndex) => <tr className={rowIndex % 2 ? "bg-black/[0.018]" : ""} key={row.name}><th className="border-t px-3 py-2.5 font-semibold" scope="row">{row.name}</th><td className="border-t px-3 py-2.5"><span className="block font-medium">{row.firstValue}</span><span className="block text-xs text-[var(--text-tertiary)]">{row.firstDate}</span></td><td className="border-t px-3 py-2.5"><span className="block font-medium">{row.lastValue}</span><span className="block text-xs text-[var(--text-tertiary)]">{row.lastDate}</span></td><td className="border-t px-3 py-2.5 text-right font-semibold">{row.change}</td></tr>)}</tbody>
            </table>
          </div>
          <div className="divide-y divide-[var(--assistant-response-border)] sm:hidden">{comparison.map(row => <section className="p-3" key={row.name}><div className="flex items-center justify-between gap-3"><h3 className="font-semibold">{row.name}</h3><span className="font-semibold">{row.change}</span></div><dl className="mt-2 grid grid-cols-2 gap-3 text-sm"><div><dt className="text-xs text-[var(--text-tertiary)]">Earliest</dt><dd className="mt-0.5 font-medium">{row.firstValue}</dd><dd className="text-xs text-[var(--text-tertiary)]">{row.firstDate}</dd></div><div><dt className="text-xs text-[var(--text-tertiary)]">Latest</dt><dd className="mt-0.5 font-medium">{row.lastValue}</dd><dd className="text-xs text-[var(--text-tertiary)]">{row.lastDate}</dd></div></dl></section>)}</div>
        </div>;
      }
      const bulletLines = paragraph.trim().split(/\r?\n/);
      if (!table && bulletLines.length && bulletLines.every(line => /^\s*[-*•]\s+\S/.test(line))) {
        return <ul className="list-disc space-y-1 pl-6" key={index}>
          {bulletLines.map((line, i) => <li className="whitespace-pre-wrap" key={i}>{line.replace(/^\s*[-*•]\s+/, "")}</li>)}
        </ul>;
      }
      if (!table) return <p className="whitespace-pre-wrap" key={index}>{inlineText(paragraph)}</p>;
      return <div className="overflow-hidden rounded-xl border border-[var(--assistant-response-border)] bg-[var(--surface-primary)]" key={index}>
        <div className="overflow-x-auto"><table className="w-full border-collapse text-left text-sm">
          <thead className="bg-black/[0.025]"><tr>{table.headers.map((cell, i) => <th className="px-3 py-2.5 font-semibold" scope="col" key={i}>{cell}</th>)}</tr></thead>
          <tbody>{table.rows.map((row, i) => <tr className={i % 2 ? "bg-black/[0.018]" : ""} key={i}>{row.map((cell, j) => <td className="border-t px-3 py-2.5 align-top" key={j}>{cell}</td>)}</tr>)}</tbody>
        </table></div>
      </div>;
    })}
  </div>;
}

function inlineText(text: string) {
  return text.split(/(`[^`\n]+`|\*\*[^*\n]+\*\*)/g).map((part, index) =>
    part.startsWith("`") && part.endsWith("`") ? <code className="rounded bg-black/5 px-1 font-mono text-[0.9em]" key={index}>{part.slice(1,-1)}</code>
    : part.startsWith("**") && part.endsWith("**") ? <strong key={index}>{part.slice(2,-2)}</strong> : part);
}

function parseComparisonRows(text: string) {
  const lines=text.trim().split(/\r?\n/).filter(Boolean);
  if(lines.length<2||lines.length>10) return null;
  const rows=lines.map(line=>{
    const match=/^([^:\n]{1,40}):\s+(.+?)\s+on\s+(.+?)\s+to\s+(.+?)\s+on\s+(.+?)\.\s+Change:\s+([+-]?\d+(?:\.\d+)?\s+\S+)\.$/.exec(line.trim());
    return match?{name:match[1].trim(),firstValue:match[2].trim(),firstDate:match[3].trim(),lastValue:match[4].trim(),lastDate:match[5].trim(),change:match[6].trim()}:null;
  });
  return rows.every(Boolean)?rows as Array<{name:string;firstValue:string;firstDate:string;lastValue:string;lastDate:string;change:string}>:null;
}
