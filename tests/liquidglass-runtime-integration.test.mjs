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

test("the stable glass target is mounted and measured before the real API initializes", () => {
  assert.match(header, /data-liquid-glass-static=""[\s\S]*mobile-liquid-glass-scene[\s\S]*data-liquid-glass-skip-content=""[\s\S]*ref=\{mobileGlassRef\}/);
  assert.match(header, /useMobileLiquidGlass\(mobileGlassRootRef, mobileGlassRef, showMobileNavigation\)/);
  const measurement = hook.indexOf("const measured = measuredSize(glass)");
  const nonZero = hook.indexOf("measured.width <= 0 || measured.height <= 0");
  const moduleImport = hook.indexOf('import("../vendor/liquidglass/index.js")');
  const initializer = hook.indexOf("liquidGlassModule.LiquidGlass.init({");
  assert.ok(measurement > 0 && measurement < nonZero && nonZero < moduleImport && moduleImport < initializer);
  assert.match(hook.slice(hook.indexOf("requestAnimationFrame"), measurement), /await document\.fonts\.ready/);
  assert.match(hook.slice(nonZero, moduleImport), /await inspectForeignObjectSupport\(controller\.signal\)/);
  assert.match(runtime, /static async init\(options\)[\s\S]*new _LiquidGlass\(options\)[\s\S]*await instance\._start\(\)/);
  assert.match(runtime, /el\.parentElement !== this\.root/);
});

test("one pending initialization and one retained active instance are enforced", () => {
  assert.match(hook, /let initializing = false;[\s\S]*let instance: LiquidGlassInstance \| null = null/);
  assert.match(hook, /if \(instance\) \{[\s\S]*return;[\s\S]*if \(initializing\) return;/);
  assert.match(hook, /const controller = new AbortController\(\);[\s\S]*const attemptGeneration = \+\+generation/);
  assert.match(hook, /controller\.signal\.aborted \|\| attemptGeneration !== generation \|\| cancelled/);
  assert.match(hook, /destroyDetachedInstance\(nextInstance, "stale_initialization"\)/);
  assert.match(hook, /instance = nextInstance;[\s\S]*lastInstanceMetrics = measuredMetrics\(glass\)[\s\S]*active_instance_count \+= 1/);
  assert.match(hook, /const runtimeCanvas = findRuntimeCanvas\(glass\)/);
  assert.match(types, /markChanged\(element\?: HTMLElement\): void/);
});

test("route rerenders and active-state changes cannot restart LiquidGlass", () => {
  assert.doesNotMatch(hook, /pathname|lifecycleKey|route_change/);
  assert.match(hook, /\}, \[enabled, glassRef, rootRef\]\);/);
  assert.match(header, /useMobileLiquidGlass\(mobileGlassRootRef, mobileGlassRef, showMobileNavigation\)/);
  assert.doesNotMatch(header, /useMobileLiquidGlass\([^\n]*pathname/);
});

test("the capture root excludes icons, labels, and generated canvas content", () => {
  const mobile = header.slice(header.indexOf('<nav aria-label="Mobile navigation"'));
  const glassEnd = mobile.indexOf("ref={mobileGlassRef} />");
  const contentStart = mobile.indexOf('data-liquid-glass-ignore=""');
  const firstIcon = mobile.indexOf("<NavigationIcon");
  assert.ok(glassEnd > 0 && contentStart > glassEnd && firstIcon > contentStart);
  assert.match(mobile, /data-liquid-glass-static=""/);
  assert.match(mobile, /data-liquid-glass-skip-content=""/);
  assert.match(mobile, /data-liquid-glass-ignore=""/);
  assert.match(runtime, /if \(!this\.root\.hasAttribute\("data-liquid-glass-static"\)\) \{[\s\S]*new MutationObserver/);
  assert.match(runtime, /el\.hasAttribute\("data-liquid-glass-skip-content"\)[\s\S]*_glassContentImages\.delete\(el\)/);
  assert.match(runtime, /child\.hasAttribute\("data-liquid-glass-ignore"\)/);
});

test("generated canvas mutations, image loads, and ordinary rerenders schedule no restart", () => {
  assert.doesNotMatch(hook, /MutationObserver|ResizeObserver|addEventListener\("load"|querySelectorAll\("img"/);
  assert.doesNotMatch(hook, /addEventListener\("resize"|addEventListener\("orientationchange"/);
  assert.match(runtime, /data-liquid-glass-static[\s\S]*this\._observer = new MutationObserver/);
  assert.match(hook, /image_load_restarts: 0/);
  assert.match(hook, /mutation_restarts: 0/);
});

test("runtime resize is debounced, dimension-aware, and never recaptures skip-content glass", () => {
  assert.match(runtime, /_scheduleResize\(\) \{[\s\S]*clearTimeout\(this\._resizeTimer\)[\s\S]*setTimeout\([\s\S]*}, 250\)/);
  assert.match(runtime, /previous\.width === metrics\.width && previous\.height === metrics\.height && previous\.dpr === metrics\.dpr/);
  assert.match(runtime, /if \(!el\.hasAttribute\("data-liquid-glass-skip-content"\)\) this\._glassContentDirty\.add\(el\)/);
  assert.match(runtime, /if \(!el\.hasAttribute\("data-liquid-glass-skip-content"\)\) \{\s*this\.capture\.invalidateCache\(el\);\s*this\._glassContentDirty\.add\(el\);/);
  assert.match(runtime, /clearTimeout\(this\._resizeTimer\)/);
});

test("hidden and visible transitions retain a healthy instance and recapture only changed geometry", () => {
  assert.match(hook, /document\.visibilityState !== "visible"[\s\S]*cancelPendingInitialization\(true\)[\s\S]*return;/);
  assert.match(hook, /if \(instance\) \{[\s\S]*metricsMatch\(lastInstanceMetrics, currentMetrics\)[\s\S]*instance\.markChanged/);
  assert.match(hook, /left\.width === right\.width && left\.height === right\.height && left\.dpr === right\.dpr/);
  const visibilityHandler = hook.slice(hook.indexOf("const handleVisibilityChange"), hook.indexOf('root.dataset.liquidGlassState = "fallback"'));
  assert.doesNotMatch(visibilityHandler, /destroyActiveInstance/);
});

test("cleanup destroys only a retained instance and stale async results are discarded", () => {
  assert.match(hook, /const destroyActiveInstance[\s\S]*if \(!instance\) return;[\s\S]*instance = null;[\s\S]*activeInstance\.destroy\(\)/);
  assert.match(hook, /return \(\) => \{[\s\S]*cancelPendingInitialization\(false\)[\s\S]*destroyActiveInstance\("unmount"\)/);
  assert.match(runtime, /destroy\(\) \{[\s\S]*clearTimeout\(this\._resizeTimer\)[\s\S]*this\._observer\?\.disconnect\(\)/);
});

test("no cache-busting or changing navigation image URLs are generated", () => {
  const integration = header + "\n" + hook;
  assert.doesNotMatch(integration, /cacheBust|cache-bust|Date\.now\(\)|Math\.random\(\)|URLSearchParams/);
  for (const path of ["today_house.png", "history_clock.png", "ask_chat.png", "pets_paw.png", "more_dots.png"]) {
    assert.equal((header.match(new RegExp(path.replace(".", "\\."), "g")) ?? []).length, 0, "paths stay centralized outside the lifecycle integration");
  }
  assert.match(header, /<NavigationIcon asset=\{item\.asset\} eager \/>/);
});

test("fallback remains visible and generated canvas has deterministic stacking", () => {
  assert.match(hook, /root\.dataset\.liquidGlassState = "fallback"/);
  assert.match(hook, /!reducedMotionQuery\.matches/);
  assert.match(hook, /catch \{[\s\S]*initialization_failed/);
  assert.match(css, /\.mobile-liquid-glass-scene \{[\s\S]*backdrop-filter: blur\(24px\)/);
  assert.match(css, /\.mobile-liquid-glass \{[\s\S]*z-index: 1/);
  assert.match(css, /\.mobile-liquid-glass > canvas \{[\s\S]*z-index: 0 !important/);
  assert.match(css, /\.mobile-liquid-glass-content \{[\s\S]*z-index: 2/);
});

test("desktop never loads the runtime and browser APIs remain effect-scoped", () => {
  assert.match(hook, /const currentSupport = mobileQuery\.matches[\s\S]*\? readSupport\(\)[\s\S]*: \{ backdropFilterSupported: false/);
  assert.doesNotMatch(header, /import\("\.\.\/vendor\/liquidglass/);
  const beforeHookEffect = hook.slice(0, hook.indexOf("useEffect(() =>"));
  assert.doesNotMatch(beforeHookEffect, /inspectLiquidGlassSupport\(\);|measuredSize\(glass\)|import\("\.\.\/vendor\/liquidglass/);
});

test("development lifecycle diagnostics are counters only and privacy-safe", () => {
  assert.match(hook, /process\.env\.NODE_ENV !== "development"/);
  for (const counter of ["init_attempts", "successful_instances", "destroy_calls", "capture_attempts", "resize_restarts", "mutation_restarts", "image_load_restarts", "active_instance_count", "target_identity_changes"]) {
    assert.match(hook, new RegExp(counter + ": 0"));
  }
  const diagnosticContract = hook.slice(hook.indexOf("type LiquidGlassDiagnostic"), hook.indexOf("const MOBILE_MEDIA_QUERY"));
  assert.doesNotMatch(diagnosticContract, /url|path|route|cookie|session|token|email|user|password|authorization|ip_address/i);
});

test("the existing CSP permits the one-time data-image capability probe without broadening policy", () => {
  assert.match(runtime, /data:image\/svg\+xml/);
  assert.match(runtime, /foreignObject/);
  assert.match(hook, /data:image\/svg\+xml;charset=utf-8/);
  assert.match(csp, /\["img-src", unique\(\["'self'", "data:"/);
  assert.doesNotMatch(csp, /unsafe-eval.*production|\["worker-src", \["\*"\]\]/);
});
