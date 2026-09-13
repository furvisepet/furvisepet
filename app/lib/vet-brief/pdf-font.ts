import { inflateSync } from "node:zlib";

/** Restore pinned local WOFF1 assets to their original sfnt tables for full PDF
 * embedding. No glyph subsetting: the bundled fontkit subset encoder can lose
 * outlines while leaving apparently valid searchable text. WOFF1 layout:
 * https://www.w3.org/TR/WOFF/#TableDirectory */
export function fullPdfFont(bytes: Uint8Array): Uint8Array {
  const source = Buffer.from(bytes);
  if (source.readUInt32BE(0) !== 0x774f4646) return bytes;
  const count = source.readUInt16BE(12);
  const size = source.readUInt32BE(16);
  if (!count || count > 256 || size > 32 * 1024 * 1024 || source.length < 44 + count * 20) throw new Error("Invalid bundled WOFF font");
  const output = Buffer.alloc(size);
  source.copy(output, 0, 4, 8);
  const power = Math.floor(Math.log2(count));
  output.writeUInt16BE(count, 4); output.writeUInt16BE(16 * 2 ** power, 6);
  output.writeUInt16BE(power, 8); output.writeUInt16BE(count * 16 - 16 * 2 ** power, 10);
  let offset = 12 + count * 16;
  let head = 0;
  for (let index = 0; index < count; index++) {
    const entry = 44 + index * 20, target = 12 + index * 16;
    const start = source.readUInt32BE(entry + 4), compressed = source.readUInt32BE(entry + 8), length = source.readUInt32BE(entry + 12);
    if (compressed > length || start + compressed > source.length || offset + length > size) throw new Error("Invalid bundled WOFF table");
    const packed = source.subarray(start, start + compressed);
    const table = compressed === length ? packed : inflateSync(packed, { maxOutputLength: length });
    if (table.length !== length) throw new Error("Incomplete bundled WOFF table");
    source.copy(output, target, entry, entry + 4);
    output.writeUInt32BE(source.readUInt32BE(entry + 16), target + 4);
    output.writeUInt32BE(offset, target + 8); output.writeUInt32BE(length, target + 12);
    table.copy(output, offset);
    if (source.toString("ascii", entry, entry + 4) === "head") head = offset;
    offset += (length + 3) & ~3;
  }
  if (offset !== size || !head || head + 12 > size) throw new Error("Invalid bundled sfnt font");
  output.writeUInt32BE(0, head + 8);
  let sum = 0;
  for (let i = 0; i < size; i += 4) sum = (sum + output.readUInt32BE(i)) >>> 0;
  output.writeUInt32BE((0xb1b0afba - sum) >>> 0, head + 8);
  return output;
}
