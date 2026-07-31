const SPECIES_ALIASES: Readonly<Record<string, string>> = {
  canine: "dog",
  canines: "dog",
  cat: "cat",
  cats: "cat",
  "cat food": "cat",
  dog: "dog",
  dogs: "dog",
  "dog food": "dog",
  feline: "cat",
  felines: "cat",
};

export function mapSpeciesCodes(values: string[]) {
  const mapped: string[] = [];
  const unsupported: string[] = [];
  for (const value of values) {
    const key = value.trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
    const code = SPECIES_ALIASES[key] || (/^[a-z][a-z0-9_]*$/.test(key) ? key : null);
    if (code) mapped.push(code);
    else if (key) unsupported.push(value);
  }
  return { codes: [...new Set(mapped)], unsupported };
}
