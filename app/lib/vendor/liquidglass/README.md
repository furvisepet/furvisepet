# LiquidGlass vendoring notice

This directory contains the published `dist/index.js` runtime from
`@ybouane/liquidglass` version `1.0.3`, copied without functional changes. A
file-level lint directive was prepended and the source-map trailer was removed;
neither changes runtime behavior. The `init` wrapper was also hardened to call
the library's own `destroy()` method if asynchronous initialization fails, so
the CSS fallback is not left with partial canvases or listeners. `index.d.ts`
is a local declaration limited to the API used by Furvise.

- Upstream: https://github.com/ybouane/liquidglass
- npm package: https://www.npmjs.com/package/@ybouane/liquidglass/v/1.0.3
- Registry integrity: `sha512-Ro/Q3vaEduvj1yUp/TVz9AYmxY+cYhnBj76eJ/Y9VQoPlRA0DWrKPQufEzrDSYzAWXL3qxiFibi5XQVW/egTnA==`
- License declared by upstream package metadata: MIT

The published package is vendored because its `postinstall` command invokes
`patch-package`, but version `1.0.3` neither includes nor declares that runtime
dependency. A normal clean npm installation therefore fails. No upstream
install script runs in Furvise builds.
