import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relativePath, encoding = "utf8") => readFileSync(path.join(root, relativePath), encoding);

function walk(relativeDirectory) {
  return readdirSync(path.join(root, relativeDirectory), { withFileTypes: true }).flatMap((entry) => {
    const relativePath = path.join(relativeDirectory, entry.name);
    return entry.isDirectory() ? walk(relativePath) : [relativePath];
  });
}

const palette = {
  "warm-canvas": "#F7F4E8",
  "soft-canvas": "#EEF7E9",
  "warm-cream": "#FFFDF7",
  "pale-sage": "#E3F3DE",
  "raised-neutral": "#F1EEE5",
  "deep-forest": "#123F27",
  "forest": "#205C38",
  "sage": "#8FCF9A",
  "soft-sage": "#CDE8C9",
  "warm-orange": "#F47A22",
  "warm-orange-hover": "#FA8A36",
  "warm-orange-active": "#EF6E17",
  "soft-orange": "#FFD8B8",
  "deep-ink-blue": "#17384B",
  "soft-ink-blue": "#E7EFF1",
  "soft-ink-blue-hover": "#D8E6EA",
  "primary-ink": "#173023",
  "secondary-ink": "#405648",
  "muted-ink": "#5F7266",
  "disabled-neutral": "#E4E0D6",
  "disabled-ink": "#52645A",
  "focus-orange": "#C9560C",
  "danger-red": "#A53B32",
  "success-green": "#276B3D",
  "warning-amber": "#8A4B0F",
};

function luminance(hex) {
  const channels = hex.slice(1).match(/.{2}/g).map((value) => Number.parseInt(value, 16) / 255);
  const [red, green, blue] = channels.map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return (0.2126 * red) + (0.7152 * green) + (0.0722 * blue);
}

function contrast(first, second) {
  const [lighter, darker] = [luminance(first), luminance(second)].sort((a, b) => b - a);
  return (lighter + 0.05) / (darker + 0.05);
}

test("the global color system defines the approved warm palette primitives centrally", () => {
  const css = read("app/globals.css");
  for (const [token, value] of Object.entries(palette)) {
    assert.match(css, new RegExp(`--${token}: ${value};`, "i"));
    assert.equal((css.match(new RegExp(value, "gi")) || []).length, 1, `${value} must have one primitive definition`);
  }

  assert.doesNotMatch(css, /--page-background:\s*(?:#000000|#000)\b/i);
});

test("the permanent warm-light color system maps every required semantic role", () => {
  const css = read("app/globals.css");
  const scheme = css.slice(css.indexOf(":root"), css.indexOf("@theme inline"));
  const directMappings = {
    "page-background": "warm-canvas",
    "section-background": "soft-canvas",
    "card-background": "warm-cream",
    "raised-card-background": "raised-neutral",
    "navigation-background": "warm-cream",
    "footer-background": "raised-neutral",
    "input-background": "warm-cream",
    "text-primary": "primary-ink",
    "text-secondary": "secondary-ink",
    "text-muted": "muted-ink",
    "primary-action-background": "warm-orange",
    "primary-action-foreground": "primary-ink",
    "primary-action-hover": "warm-orange-hover",
    "secondary-action-background": "warm-cream",
    "secondary-action-foreground": "deep-forest",
    "ghost-action-foreground": "forest",
    "selected-navigation-background": "soft-sage",
    "selected-navigation-foreground": "deep-forest",
    "chip-background": "raised-neutral",
    "chip-selected-background": "soft-sage",
    "chip-selected-foreground": "deep-forest",
    "focus-ring": "focus-orange",
    "disabled-background": "disabled-neutral",
    "disabled-foreground": "disabled-ink",
    "destructive": "danger-red",
    "success": "success-green",
    "warning": "warning-amber",
  };
  for (const [role, primitive] of Object.entries(directMappings)) assert.match(scheme, new RegExp(`--${role}: var\\(--${primitive}\\);`));
  for (const role of ["input-border", "border-subtle", "border-strong", "secondary-action-border", "surface-primary", "surface-raised", "surface-interactive", "surface-hover", "surface-selected", "surface-overlay", "secondary-action-hover", "overlay-background", "destructive-surface"]) {
    assert.match(scheme, new RegExp(`--${role}:`), `${role} must be defined`);
  }
  assert.doesNotMatch(scheme, /#000000|#000\b|terracotta|navy|rust|brand-dark-surface/i);
});

test("text, button, input, navigation, focus, selection, and disabled pairs meet contrast targets", () => {
  const checks = [
    ["heading", palette["primary-ink"], palette["warm-canvas"], 4.5],
    ["body", palette["secondary-ink"], palette["warm-canvas"], 4.5],
    ["muted and placeholder", palette["muted-ink"], palette["warm-canvas"], 4.5],
    ["input value", palette["primary-ink"], palette["warm-cream"], 4.5],
    ["input placeholder", palette["muted-ink"], palette["warm-cream"], 4.5],
    ["primary button", palette["primary-ink"], palette["warm-orange"], 4.5],
    ["primary button hover", palette["primary-ink"], palette["warm-orange-hover"], 4.5],
    ["primary button active", palette["primary-ink"], palette["warm-orange-active"], 4.5],
    ["secondary button", palette["deep-forest"], palette["warm-cream"], 4.5],
    ["navigation", palette["forest"], palette["warm-cream"], 4.5],
    ["selected navigation", palette["deep-forest"], palette["soft-sage"], 4.5],
    ["selected chip", palette["deep-forest"], palette["soft-sage"], 4.5],
    ["focus", palette["focus-orange"], palette["warm-canvas"], 3],
    ["disabled control", palette["disabled-ink"], palette["disabled-neutral"], 4.5],
    ["footer", palette["secondary-ink"], palette["raised-neutral"], 4.5],
    ["assistant strong", palette["warm-cream"], palette["deep-ink-blue"], 4.5],
    ["assistant light", palette["primary-ink"], palette["soft-ink-blue"], 4.5],
    ["suggestion selected", palette["deep-ink-blue"], palette["soft-ink-blue-hover"], 4.5],
  ];
  for (const [label, foreground, background, minimum] of checks) assert.ok(contrast(foreground, background) >= minimum, `${label} contrast is too low`);
  assert.match(read("app/globals.css"), /--input-border: rgba\(18, 63, 39, 0\.55\)/);
});

test("warm surfaces and restrained action colors are applied through shared roles", () => {
  const css = read("app/globals.css");
  const components = walk("app").filter((file) => file.endsWith(".tsx")).map((file) => read(file)).join("\n");
  const primitives = read("app/components/product-primitives.tsx");
  const header = read("app/components/app-header.tsx");
  const footer = read("app/components/app-footer.tsx");
  assert.match(css, /--surface-page: var\(--page-background\)/);
  assert.match(primitives, /standard: "bg-\[var\(--card-background\)\]"/);
  assert.match(primitives, /fieldControlClass[\s\S]*bg-\[var\(--input-background\)\][\s\S]*placeholder:text-\[var\(--text-muted\)\]/);
  assert.match(primitives, /neutral: "bg-\[var\(--chip-background\)\][\s\S]*selected: "border-\[var\(--sage\)\] bg-\[var\(--chip-selected-background\)\] text-\[var\(--chip-selected-foreground\)\]/);
  assert.match(header, /bg-\[var\(--pw-header-surface\)\][\s\S]*data-active-indicator=\{isActive\(item\.href\) \? "background"/);
  assert.match(footer, /bg-\[var\(--footer-background\)\]/);
  assert.doesNotMatch(components, /text-\[var\(--action-primary\)\]/, "orange primary background must not be reused as body or link text");
  assert.doesNotMatch(css, /--primary-action-(?:background|foreground): var\(--(?:sage|forest|deep-forest)\)/);
});

test("components consume semantic tokens and do not introduce ordinary colors", () => {
  const files = walk("app").filter((file) => /\.(?:tsx|ts|css)$/.test(file) && file !== path.join("app", "globals.css") && file !== path.join("app", "layout.tsx") && file !== path.join("app", "lib", "vet-brief", "pdf-theme.ts"));
  const failures = files.filter((file) => /#[0-9a-f]{3,8}|(?:linear|radial)-gradient|\b(?:bg|text|border|ring)-(?:white|black|red|green|blue|orange|amber|stone|gray)-/i.test(read(file)));
  assert.deepEqual(failures, [], `Unexpected component colors: ${failures.join(", ")}`);
  assert.match(read("app/components/product-primitives.tsx"), /var\(--secondary-action\)[\s\S]*var\(--secondary-action-text\)/);
  assert.match(read("app/components/account-access.tsx"), /var\(--pw-focus-ring\)/);
});

test("palette names cannot leak into user-facing application source", () => {
  const visibleSources = walk("app").filter((file) => /\.(?:tsx|ts|mjs)$/.test(file) && file !== path.join("app", "lib", "vet-brief", "pdf-theme.ts"));
  const leaked = visibleSources.filter((file) => /morning dew|overcast|early dusk|tan parchment|almond dust|coffee grounds/i.test(read(file)));
  assert.deepEqual(leaked, []);
});

test("appearance switching is absent and Products stays out of Account", () => {
  const header = read("app/components/app-header.tsx");
  const account = read("app/components/signed-in-header.tsx");
  const layout = read("app/layout.tsx");
  assert.equal(existsSync(path.join(root, "app/lib/appearance.ts")), false);
  assert.equal(existsSync(path.join(root, "app/components/appearance-provider.tsx")), false);
  assert.equal(existsSync(path.join(root, "app/components/appearance-modal.tsx")), false);
  assert.equal(existsSync(path.join(root, "app/components/theme-bootstrap.tsx")), false);
  assert.doesNotMatch([header, account, layout].join("\n"), /Appearance|openAppearance|data-theme|suppressHydrationWarning|furvise-mode|appearance-mode/i);
  assert.match(layout, /data-color-scheme="light"/);
  assert.match(layout, /meta name="color-scheme" content="light"/);
  assert.match(header, /href: "\/shop", label: "Products"/);
  assert.doesNotMatch(account, /\/shop|Products/);
});

test("approved SVG artwork is pinned, vector, transparent, and separate from UI palette tokens", () => {
  const approvedBrandMasters = new Map([
    ["public/brand/furvise-logo.svg", { fills: ["#14362f", "#1c3d30"], hash: "15103e452559f4f29b0492a6731782ecd680992f62798be95ddc7aba544f3b00" }],
    ["public/brand/furvise-wordmark.svg", { fills: ["#1c3d30"], hash: "5ce60b7d3134b5aaf00f4a4a799f46443a9eb0fd23b04724a545ad15f7c248b8" }],
    ["public/brand/furvise-heron.svg", { fills: ["#14362f"], hash: "5bc3424afd22bba0391d302494c506455df9ef3a2221525c32a033e8dda0dd0b" }],
  ]);
  for (const [file, expected] of approvedBrandMasters) {
    assert.ok(existsSync(path.join(root, file)), `${file} must remain present`);
    const source = read(file);
    const fills = [...new Set([...source.matchAll(/fill="(#[0-9a-f]{6})"/gi)].map((match) => match[1].toLowerCase()))].sort();
    assert.match(source, /<svg\b/);
    assert.doesNotMatch(source, /<image\b|\.(?:png|jpe?g|webp)\b|data:image/i);
    assert.doesNotMatch(source, /<rect\b|background(?:-color)?\s*:/i);
    assert.deepEqual(fills, expected.fills, `${file} must preserve the approved master fills`);
    assert.equal(createHash("sha256").update(read(file, null)).digest("hex"), expected.hash, `${file} must remain byte-for-byte unchanged`);
  }

  const otherPinnedAssets = new Map([
    ["app/favicon.ico", "617e8f6a24067e937ecafd8c8a8de735bf4bac546b0378f0220c884f88c952db"],
    ["public/images/dog.png", "2365277fbeadafe581fb4cb29d68226aac1b0f092903a134e06bd39f3649bab0"],
    ["public/images/cat.png", "be7498352c359a0da98b723f8852d5177cd34e8160046bbf4f85a38db9b80d77"],
  ]);
  for (const [file, expectedHash] of otherPinnedAssets) {
    assert.ok(existsSync(path.join(root, file)), `${file} must remain present`);
    assert.equal(createHash("sha256").update(read(file, null)).digest("hex"), expectedHash, `${file} must remain byte-for-byte unchanged`);
  }
  const references = [...walk("app"), ...walk("docs")]
    .filter((file) => /\.(?:tsx|ts|mjs|md)$/.test(file))
    .filter((file) => !file.replaceAll("\\", "/").endsWith("docs/security-resource-inventory.md"))
    .map((file) => read(file))
    .join("\n");
  assert.doesNotMatch(references, /logo-header-v1\.webp|\/brand\/logo\.png|App%20icon\.png|furvise-logo\.png|furvise%20logo%20website|android-chrome-|site\.webmanifest/);
});

test("BrandMark composes responsive wordmark and heron assets without distortion", () => {
  const brand = read("app/components/brand-mark.tsx");
  const namedMark = brand.slice(brand.indexOf("if (showName)"), brand.lastIndexOf("\n  return ("));
  const iconOnlyMark = brand.slice(brand.lastIndexOf("\n  return ("));
  assert.match(brand, /import Image from "next\/image"/);
  assert.match(brand, /FURVISE_BRAND_ASSET = "\/brand\/furvise-logo\.svg"/);
  assert.match(brand, /FURVISE_WORDMARK_ASSET = "\/brand\/furvise-wordmark\.svg"/);
  assert.match(brand, /FURVISE_MASCOT_ASSET = "\/brand\/furvise-heron\.svg"/);
  assert.ok(namedMark.indexOf("src={FURVISE_WORDMARK_ASSET}") < namedMark.indexOf("src={FURVISE_MASCOT_ASSET}"));
  assert.match(namedMark, /columnGap: "6px"/);
  assert.match(namedMark, /height=\{800\}[\s\S]*src=\{FURVISE_WORDMARK_ASSET\}[\s\S]*objectFit: "contain"[\s\S]*width=\{3000\}/);
  assert.match(namedMark, /height=\{2000\}[\s\S]*src=\{FURVISE_MASCOT_ASSET\}[\s\S]*objectFit: "contain"[\s\S]*width=\{2000\}/);
  assert.match(namedMark, /width: `calc\(\$\{responsiveSize\} \* 4\)`/);
  assert.match(iconOnlyMark, /height: responsiveSize[\s\S]*src=\{FURVISE_MASCOT_ASSET\}[\s\S]*width: responsiveSize/);
  const layout = read("app/layout.tsx");
  assert.match(layout, /url: "\/favicon\.ico"/);
  assert.match(layout, /manifest: "\/manifest\.webmanifest"/);
  assert.match(read("public/manifest.webmanifest"), /"src": "\/favicon\.ico"/);
});

test("visible application copy contains no encoding artifact or em dash", () => {
  const source = walk("app").filter((file) => file.endsWith(".tsx")).map((file) => read(file)).join("\n");
  assert.doesNotMatch(source, /—/);
  assert.match(source, /AI credit/);
});
