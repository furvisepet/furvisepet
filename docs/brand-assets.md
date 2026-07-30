# Furvise brand assets

The application uses the supplied brand files directly. They must not be regenerated, renamed, cropped, recolored, or optimized in place.

## Application branding

- `public/brand/logo.png`: horizontal Furvise logo used by the shared brand component and social metadata.
- `public/App icon.png`: compact Furvise mascot used where the shared brand component intentionally renders without its wordmark.
- `public/images/dog.png` and `public/images/cat.png`: transparent pet artwork used by Quick Start onboarding.

## Browser and installed-app icons

- `app/favicon.ico`: browser, shortcut, and installed-app icon source.

`public/manifest.webmanifest` and `app/layout.tsx` reference the app-folder favicon route. The public favicon files are not used by application metadata.
