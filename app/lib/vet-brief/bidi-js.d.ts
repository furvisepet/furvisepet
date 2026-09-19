declare module "bidi-js" {
  type Levels = { levels: Uint8Array; paragraphs: Array<{ start: number; end: number; level: number }> };
  export default function bidiFactory(): {
    getEmbeddingLevels(text: string, direction?: "ltr" | "rtl"): Levels;
    getReorderSegments(text: string, levels: Levels): Array<[number, number]>;
    getMirroredCharactersMap(text: string, levels: Levels): Map<number, string>;
  };
}
