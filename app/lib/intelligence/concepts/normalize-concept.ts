export function normalizeConceptLabel(value: string) {
  return value.normalize("NFKD").replace(/\p{M}+/gu, "").toLocaleLowerCase("en")
    .replace(/[^\p{L}\p{N}]+/gu, "_").replace(/^_+|_+$/g, "").slice(0, 100);
}

export function conceptTokens(value: string) {
  return [...new Set(normalizeConceptLabel(value).split("_").map(normalizeToken).filter((token) => token.length > 1))];
}

export function lexicalConceptSignature(value: string) {
  return [...conceptTokens(value)].sort().join("|");
}

export function conceptTokenSimilarity(left: string, right: string) {
  const leftTokens = conceptTokens(left);
  const rightTokens = conceptTokens(right);
  if (!leftTokens.length || !rightTokens.length) return 0;
  const overlap = leftTokens.filter((token) => rightTokens.includes(token)).length;
  return overlap / (leftTokens.length + rightTokens.length - overlap);
}

function normalizeToken(token: string) {
  if (token.length > 5 && token.endsWith("ies")) return `${token.slice(0, -3)}y`;
  if (token.length > 5 && token.endsWith("ing")) return restoreTerminalE(token.slice(0, -3));
  if (token.length > 4 && token.endsWith("ed")) return restoreTerminalE(token.slice(0, -2));
  if (token.length > 4 && token.endsWith("es")) return token.slice(0, -2);
  if (token.length > 3 && token.endsWith("s")) return token.slice(0, -1);
  return token;
}

function restoreTerminalE(value: string) {
  return /(?:chang|improv|resolv|recurr|observ|continu)$/.test(value) ? `${value}e` : value.replace(/([b-df-hj-np-rt-vz])\1$/i, "$1");
}
