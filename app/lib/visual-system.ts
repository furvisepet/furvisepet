const PET_ACCENT_TOKENS = [
  "var(--accent-sage)",
  "var(--soft-sage)",
] as const;

export function getPetAccent(seed: string) {
  const hash = [...seed].reduce((accumulator, character) => accumulator + character.charCodeAt(0), 0);
  return PET_ACCENT_TOKENS[hash % PET_ACCENT_TOKENS.length];
}
