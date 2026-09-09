export type AskTextBlock = { kind: "prose"; text: string } | { kind: "code"; text: string; language: string; raw: string };

/** Fenced code is literal content. React renders it as escaped text, never HTML. */
export function splitAskTextBlocks(value: string): AskTextBlock[] {
  const blocks: AskTextBlock[] = [];
  const fence = /^```([a-zA-Z0-9_+-]*)[^\S\r\n]*\r?\n([\s\S]*?)^```[^\S\r\n]*$/gm;
  let start = 0;
  for (const match of value.matchAll(fence)) {
    if (match.index > start) blocks.push({ kind: "prose", text: value.slice(start, match.index) });
    blocks.push({ kind: "code", language: match[1], text: match[2].replace(/\r?\n$/, ""), raw: match[0] });
    start = match.index + match[0].length;
  }
  if (start < value.length) blocks.push({ kind: "prose", text: value.slice(start) });
  return blocks;
}

export function mapAskProse(value: string, transform: (text: string) => string): string {
  return splitAskTextBlocks(value).map(block => {
    if (block.kind === "code") return block.raw;
    if (!block.text.trim()) return block.text;
    const leading = /^\s*/.exec(block.text)![0], trailing = /\s*$/.exec(block.text)![0];
    return leading + transform(block.text.trim()) + trailing;
  }).join("");
}

export function askProseOnly(value: string): string {
  return splitAskTextBlocks(value).filter(block => block.kind === "prose").map(block => block.text).join("\n");
}
