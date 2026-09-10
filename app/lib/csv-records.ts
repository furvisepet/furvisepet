/** Strict CSV records, without executing or interpreting cell content. */
export function parseCsvRecords(text: string): string[][] | null {
  if (!text || text.length > 30000) return null;
  const rows: string[][] = []; let row: string[] = [], cell = "";
  let quoted = false, closed = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; }
        else { quoted = false; closed = true; }
      } else cell += ch;
      continue;
    }
    if (ch === "," || ch === "\n" || ch === "\r") {
      row.push(cell); cell = ""; closed = false;
      if (ch !== ",") {
        rows.push(row); row = [];
        if (ch === "\r" && text[i+1] === "\n") i++;
      }
    } else if (closed) return null;
    else if (ch === '"') { if (cell) return null; quoted = true; }
    else cell += ch;
  }
  if (quoted) return null;
  if (row.length || cell || closed) { row.push(cell); rows.push(row); }
  if (rows.length < 2 || rows[0].length < 2 || rows.some(r => r.length !== rows[0].length)) return null;
  return rows;
}
