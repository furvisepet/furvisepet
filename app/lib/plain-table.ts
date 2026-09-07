/** Bounded plain-text tables. Cells remain text, never HTML or Markdown. */
export function parsePlainTable(text: string): { headers: string[]; rows: string[][] } | null {
  if (text.length > 3600) return null;
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 3 || lines.length > 34) return null;
  if (lines.some(line => !/^\s*\|.*\|\s*$/.test(line))) return null;
  const cells = lines.map(line => line.trim().slice(1, -1).split('|').map(cell => cell.trim()));
  const width = cells[0].length;
  if (width < 2 || width > 6 || cells.some(row => row.length !== width)) return null;
  if (!cells[0].every(Boolean) || !cells[1].every(cell => /^:?-{3,}:?$/.test(cell))) return null;
  const rows = cells.slice(2);
  if (rows.some(row => !row.some(Boolean) || row.every(cell => /^:?-{3,}:?$/.test(cell)))) return null;
  return { headers: cells[0], rows };
}
