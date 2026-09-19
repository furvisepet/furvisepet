import { copyFile, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const publicDirectory = path.join(repositoryRoot, "public");
const heronSource = path.join(publicDirectory, "brand", "furvise-heron.svg");
const warmCream = { r: 247, g: 244, b: 232, alpha: 1 };

async function renderIcon(size, markScale, background) {
  const markSize = Math.round(size * markScale);
  const mark = await sharp(heronSource)
    .trim()
    .resize({
      width: markSize,
      height: markSize,
      fit: "inside",
      withoutEnlargement: false,
    })
    .png()
    .toBuffer();
  const metadata = await sharp(mark).metadata();

  return sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background,
    },
  })
    .composite([
      {
        input: mark,
        left: Math.round((size - metadata.width) / 2),
        top: Math.round((size - metadata.height) / 2),
      },
    ])
    .png()
    .toBuffer();
}

function createIco(images) {
  const headerSize = 6;
  const entrySize = 16;
  const directory = Buffer.alloc(headerSize + entrySize * images.length);
  directory.writeUInt16LE(0, 0);
  directory.writeUInt16LE(1, 2);
  directory.writeUInt16LE(images.length, 4);

  let offset = directory.length;
  images.forEach(({ buffer, size }, index) => {
    const entryOffset = headerSize + entrySize * index;
    directory.writeUInt8(size === 256 ? 0 : size, entryOffset);
    directory.writeUInt8(size === 256 ? 0 : size, entryOffset + 1);
    directory.writeUInt8(0, entryOffset + 2);
    directory.writeUInt8(0, entryOffset + 3);
    directory.writeUInt16LE(1, entryOffset + 4);
    directory.writeUInt16LE(32, entryOffset + 6);
    directory.writeUInt32LE(buffer.length, entryOffset + 8);
    directory.writeUInt32LE(offset, entryOffset + 12);
    offset += buffer.length;
  });

  return Buffer.concat([directory, ...images.map(({ buffer }) => buffer)]);
}

const faviconImages = await Promise.all(
  [16, 32, 48, 64].map(async (size) => ({
    size,
    buffer: await renderIcon(size, size === 16 ? 0.68 : size === 32 ? 0.72 : 0.74, warmCream),
  })),
);
const favicon = createIco(faviconImages);

await Promise.all([
  writeFile(path.join(publicDirectory, "favicon-16.png"), faviconImages[0].buffer),
  writeFile(path.join(publicDirectory, "favicon-32.png"), faviconImages[1].buffer),
  writeFile(path.join(publicDirectory, "favicon.ico"), favicon),
  writeFile(path.join(publicDirectory, "furvise.ico"), favicon),
  writeFile(path.join(publicDirectory, "apple-touch-icon.png"), await renderIcon(180, 0.73, warmCream)),
  writeFile(path.join(publicDirectory, "android-192.png"), await renderIcon(192, 0.73, warmCream)),
  writeFile(path.join(publicDirectory, "android-512.png"), await renderIcon(512, 0.73, warmCream)),
  writeFile(path.join(publicDirectory, "maskable-icon-512.png"), await renderIcon(512, 0.56, warmCream)),
  writeFile(path.join(publicDirectory, "App icon.png"), await renderIcon(1254, 0.73, warmCream)),
]);

await copyFile(path.join(publicDirectory, "favicon.ico"), path.join(repositoryRoot, "app", "favicon.ico"));

const source = await readFile(heronSource);
console.log(`Generated Furvise icon set from ${path.relative(repositoryRoot, heronSource)} (${source.length} source bytes).`);
