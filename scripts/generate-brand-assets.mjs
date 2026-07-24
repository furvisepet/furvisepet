import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const root = process.cwd();
const sourcePath = path.join(root, "public", "brand", "furvise-logo.png");
const source = await readFile(sourcePath);

const pngTargets = [
  [16, "public/favicon-16x16.png"],
  [32, "public/favicon-32x32.png"],
  [180, "public/apple-touch-icon.png"],
  [192, "public/android-chrome-192x192.png"],
  [512, "public/android-chrome-512x512.png"],
];

await Promise.all(
  pngTargets.map(([size, target]) =>
    sharp(source)
      .resize(size, size, { fit: "contain" })
      .png()
      .toFile(path.join(root, target)),
  ),
);

const faviconPng = await sharp(source).resize(48, 48, { fit: "contain" }).png().toBuffer();
const favicon = createPngIco(faviconPng, 48);
await Promise.all([
  writeFile(path.join(root, "app", "favicon.ico"), favicon),
  writeFile(path.join(root, "public", "favicon.ico"), favicon),
]);

const ogLogo = await sharp(source).resize(210, 210, { fit: "contain" }).png().toBuffer();
const ogText = Buffer.from(`
  <svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg">
    <rect width="1200" height="630" fill="#0f1115"/>
    <text x="352" y="274" fill="#f7f8fa" font-family="Arial, Helvetica, sans-serif" font-size="88" font-weight="700">Furvise</text>
    <text x="352" y="342" fill="#b8c0cb" font-family="Arial, Helvetica, sans-serif" font-size="34">Pet care history, notes, products,</text>
    <text x="352" y="388" fill="#b8c0cb" font-family="Arial, Helvetica, sans-serif" font-size="34">and guidance</text>
  </svg>
`);

await sharp(ogText)
  .composite([{ input: ogLogo, left: 94, top: 210 }])
  .png()
  .toFile(path.join(root, "public", "brand", "furvise-og.png"));

function createPngIco(png, size) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(1, 4);

  const entry = Buffer.alloc(16);
  entry.writeUInt8(size === 256 ? 0 : size, 0);
  entry.writeUInt8(size === 256 ? 0 : size, 1);
  entry.writeUInt8(0, 2);
  entry.writeUInt8(0, 3);
  entry.writeUInt16LE(1, 4);
  entry.writeUInt16LE(32, 6);
  entry.writeUInt32LE(png.length, 8);
  entry.writeUInt32LE(header.length + entry.length, 12);

  return Buffer.concat([header, entry, png]);
}
