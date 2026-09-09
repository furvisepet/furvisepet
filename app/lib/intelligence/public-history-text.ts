/** Remove only bracketed annotations composed entirely of known source IDs. */
export function stripKnownHistoryCitations(text: string, ids: Set<string>): string {
  return text.replace(/\s*\[([^\[\]\n]+)\]/g, (match, content: string) => {
    const tokens = content.split(/\s*,\s*/).map(token => token.trim());
    return tokens.length && tokens.every(token => ids.has(token)) ? "" : match;
  });
}
