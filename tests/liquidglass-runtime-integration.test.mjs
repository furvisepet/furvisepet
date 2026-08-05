import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const header = read("app/components/app-header.tsx");
const hook = read("app/lib/navigation/use-mobile-liquid-glass.ts");
const runtime = read("app/lib/vendor/liquidglass/index.js");
const types = read("app/lib/vendor/liquidglass/index.d.ts");
const css = read("app/globals.css");
const csp = read("app/lib/security/headers/content-security-policy.ts");

test("capability detection uses distinct Canvas2D and WebGL canvases", () => {
  assert.match(hook, /const canvas2d = document\.createElement\("canvas"\);[\s\S]*canvas2d\.getContext\("2d"\)/);
  assert.match(hook, /const webglCanvas = document\.createElement\("canvas"\);[\s\S]*webglCanvas\.getContext\("webgl"\)/);
  assert.doesNotMatch(hook, /canvas2d\.getContext\("webgl"\)|webglCanvas\.getContext\("2d"\)/);
});

test("the mounted direct-child dock is measured before the real API initializes", () => {
  assert.match(header, /mobile-liquid-glass-root[\s\S]*ref=\{mobileGlassRootRef\}[\s\S]*mobile-liquid-glass-scene[\s\S]*ref=\{mobileGlassRef\}/);
  assert.match(header, /useMobileLiquidGlass\(mobileGlassRootRef, mobileGlassRef, showMobileNavigation, pathname\)/);
  const measurement = hook.indexOf("const size = measuredSize(glass)");
  const nonZero = hook.indexOf("size.width <= 0 || size.height <= 0");
  const moduleImport = hook.indexOf('import("../vendor/liquidglass/index.js")');
  const initializer = hook.indexOf("liquidGlassModule.LiquidGlass.init({");
  assert.ok(measurement > 0 && measurement < nonZero && nonZero < moduleImport && moduleImport < initializer);
  assert.match(hook.slice(nonZero, moduleImport), /await inspectForeignObjectSupport\(\)/);
  assert.match(runtime, /static async init\(options\)[\s\S]*new _LiquidGlass\(options\)[\s\S]*await instance\._start\(\)/);
  assert.match(runtime, /el\.parentElement !== this\.root/);
});

test("successful initialization retains one non-zero generated canvas", () => {
  assert.match(hook, /const runtimeCanvas = findRuntimeCanvas\(glass\)/);
  assert.match(hook, /runtimeCanvas\.width <= 0 \|\| runtimeCanvas\.height <= 0/);
  assert.match(hook, /instance = nextInstance;[\s\S]*liquidGlassState = "active"/);
  assert.match(hook, /if \(instance\) \{[\s\S]*instance\.markChanged/);
  assert.match(types, /markChanged\(element\?: HTMLElement\): void/);
});

test("failures, unsupported devices, and reduced motion keep the fallback", () => {
  assert.match(hook, /root\.dataset\.liquidGlassState = "fallback"/);
  assert.match(hook, /!reducedMotionQuery\.matches/);
  assert.match(hook, /currentSupport\.backdropFilterSupported[\s\S]*currentSupport\.canvasSupported[\s\S]*currentSupport\.webglSupported/);
  assert.match(hook, /foreign_object_unsupported[\s\S]*inspectForeignObjectSupport\(\)/);
  assert.match(hook, /catch \{[\s\S]*stop\("unsupported"\)/);
  assert.match(css, /\.mobile-liquid-glass-scene \{[\s\S]*backdrop-filter: blur\(24px\)/);
});

test("desktop does not inspect capabilities or load the runtime", () => {
  assert.match(hook, /const currentSupport = mobileQuery\.matches[\s\S]*\? readSupport\(\)[\s\S]*: \{ backdropFilterSupported: false/);
  assert.match(hook, /if \(!current\.eligible\)[\s\S]*return;[\s\S]*await new Promise/);
  assert.doesNotMatch(header, /import\("\.\.\/vendor\/liquidglass/);
});

test("visibility, route, resize, and orientation lifecycle cannot duplicate instances", () => {
  assert.match(hook, /document\.addEventListener\("visibilitychange", handleEligibilityChange\)/);
  assert.match(hook, /window\.addEventListener\("orientationchange", handleResize\)/);
  assert.match(hook, /window\.addEventListener\("resize", handleResize/);
  assert.match(hook, /window\.clearTimeout\(resizeRestart\)[\s\S]*requestRestart\("resize"\)/);
  assert.match(hook, /if \(instance\)[\s\S]*return;[\s\S]*if \(initializing\) return/);
  assert.match(hook, /restartRequested = true/);
  assert.match(hook, /\[enabled, glassRef, lifecycleKey, rootRef\]/);
});

test("the captured scene and generated canvas have visible deterministic stacking", () => {
  assert.match(css, /\.mobile-liquid-glass-scene \{[\s\S]*background:[\s\S]*box-shadow:/);
  assert.match(css, /\.mobile-liquid-glass \{[\s\S]*background: transparent/);
  assert.match(css, /\.mobile-liquid-glass > canvas \{[\s\S]*z-index: 0 !important/);
  assert.match(css, /\.mobile-liquid-glass > :not\(canvas\) \{[\s\S]*z-index: 1/);
  assert.doesNotMatch(css, /\.mobile-liquid-glass \{[\s\S]*backdrop-filter: blur\(24px\)/);
});

test("browser APIs remain effect-scoped and diagnostics are development-only and privacy-safe", () => {
  const beforeHookEffect = hook.slice(0, hook.indexOf("useEffect(() =>"));
  assert.doesNotMatch(beforeHookEffect, /inspectLiquidGlassSupport\(\);|measuredSize\(glass\)|import\("\.\.\/vendor\/liquidglass/);
  assert.match(hook, /process\.env\.NODE_ENV !== "development"/);
  const diagnosticContract = hook.slice(hook.indexOf("type LiquidGlassDiagnostic"), hook.indexOf("const MOBILE_MEDIA_QUERY"));
  assert.doesNotMatch(diagnosticContract, /url|path|route(?!_change)|cookie|session|token|email|user|password|authorization|ip_address/i);
});

test("the existing CSP already permits the runtime data-image capture without broadening policy", () => {
  assert.match(runtime, /data:image\/svg\+xml/);
  assert.match(runtime, /foreignObject/);
  assert.match(hook, /data:image\/svg\+xml;charset=utf-8/);
  assert.match(csp, /\["img-src", unique\(\["'self'", "data:"/);
  assert.match(csp, /\["style-src", \["'self'", "'unsafe-inline'"\]\]/);
  assert.doesNotMatch(csp, /unsafe-eval.*production|\["worker-src", \["\*"\]\]/);
});
