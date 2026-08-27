# Furvise brand assets

The application uses the supplied SVG brand files directly. They must not be regenerated, renamed, cropped, recolored, or optimized in place.

## Application branding

- `public/brand/furvise-logo.svg`: approved horizontal heron and Furvise lockup used for social metadata and large brand treatments.
- `public/brand/furvise-wordmark.svg`: approved Furvise wordmark used by the shared `BrandMark` on compact header/footer surfaces.
- `public/brand/furvise-heron.svg`: approved standalone heron used alongside the wordmark in the shared `BrandMark`, by icon-only UI, and as the source for browser and installed-app icons.
- Compact shared branding composes the wordmark followed by the heron as separate approved assets with a 6px gap so the small lockup does not visually crowd the final `E`.
- `public/images/dog.png` and `public/images/cat.png`: transparent pet artwork used by Quick Start onboarding.

## Browser and installed-app icons

- `public/favicon.ico`, `public/favicon-16.png`, and `public/favicon-32.png`: browser favicon assets.
- `public/apple-touch-icon.png`: Apple touch icon on Warm Cream.
- `public/android-192.png`, `public/android-512.png`, and `public/maskable-icon-512.png`: PWA icons on Warm Cream.
- `app/favicon.ico`: Next.js file-based favicon generated from the same approved heron source.

`public/manifest.webmanifest` declares the Android and maskable icons. `app/layout.tsx` declares the public favicon and Apple touch icon assets.
