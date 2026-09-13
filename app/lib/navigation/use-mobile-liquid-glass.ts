"use client";

import { useEffect, type RefObject } from "react";

type LiquidGlassInstance = {
  destroy: () => void;
  markChanged: (element?: HTMLElement) => void;
};

type LiquidGlassSupport = {
  backdropFilterSupported: boolean;
  canvasSupported: boolean;
  webglSupported: boolean;
};

type DestroyReason = "reduced_motion" | "stale_initialization" | "unmount" | "unsupported";

type LiquidGlassDiagnostic = Partial<{
  backdrop_filter_supported: boolean;
  canvas_attached: boolean;
  canvas_supported: boolean;
  destroyed_reason: DestroyReason;
  foreign_object_supported: boolean;
  initialization_failed_reason: "api_unavailable" | "canvas_missing" | "dimensions_unavailable" | "foreign_object_unsupported" | "initialization_exception" | "module_load_failed";
  mobile_match: boolean;
  reduced_motion: boolean;
  target_found: boolean;
  target_height: number;
  target_width: number;
  webgl_supported: boolean;
}>;

const lifecycleCounters = {
  active_instance_count: 0,
  capture_attempts: 0,
  destroy_calls: 0,
  image_load_restarts: 0,
  init_attempts: 0,
  mutation_restarts: 0,
  resize_restarts: 0,
  successful_instances: 0,
  target_identity_changes: 0,
};
const targetIdentities = new WeakMap<HTMLElement, number>();
let lastTargetIdentity = 0;
let nextTargetIdentity = 1;

const MOBILE_MEDIA_QUERY = "(max-width: 1023px)";
const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";
const MEASUREMENT_RETRY_MS = 100;
const LIQUID_GLASS_IDLE_TIMEOUT_MS = 2_000;
const LIQUID_GLASS_FALLBACK_DELAY_MS = 500;

function emitLiquidGlassDiagnostic(event: string, diagnostic: LiquidGlassDiagnostic = {}) {
  if (process.env.NODE_ENV !== "development") return;
  console.debug("[Furvise LiquidGlass]", { event, ...diagnostic, ...lifecycleCounters });
}

function recordTargetIdentity(target: HTMLElement) {
  let identity = targetIdentities.get(target);
  if (!identity) {
    identity = nextTargetIdentity++;
    targetIdentities.set(target, identity);
  }
  if (lastTargetIdentity && lastTargetIdentity !== identity) lifecycleCounters.target_identity_changes += 1;
  lastTargetIdentity = identity;
}

function inspectLiquidGlassSupport(): LiquidGlassSupport {
  const backdropFilterSupported = typeof CSS !== "undefined" && (
    CSS.supports("backdrop-filter", "blur(1px)")
    || CSS.supports("-webkit-backdrop-filter", "blur(1px)")
  );

  let canvasSupported = false;
  let webglSupported = false;
  try {
    const canvas2d = document.createElement("canvas");
    canvasSupported = Boolean(canvas2d.getContext("2d"));
    const webglCanvas = document.createElement("canvas");
    const webgl = webglCanvas.getContext("webgl");
    webglSupported = Boolean(webgl);
    webgl?.getExtension("WEBGL_lose_context")?.loseContext();
  } catch {
    canvasSupported = false;
    webglSupported = false;
  }

  return { backdropFilterSupported, canvasSupported, webglSupported };
}

function measuredSize(element: HTMLElement) {
  const rect = element.getBoundingClientRect();
  return { height: Math.round(rect.height), width: Math.round(rect.width) };
}

function measuredMetrics(element: HTMLElement) {
  return { ...measuredSize(element), dpr: window.devicePixelRatio || 1 };
}

function metricsMatch(
  left: ReturnType<typeof measuredMetrics> | null,
  right: ReturnType<typeof measuredMetrics>,
) {
  return Boolean(left && left.width === right.width && left.height === right.height && left.dpr === right.dpr);
}

function inspectForeignObjectSupport(signal: AbortSignal) {
  if (typeof SVGForeignObjectElement === "undefined" || signal.aborted) return Promise.resolve(false);

  return new Promise<boolean>((resolve) => {
    const image = new Image();
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (!context) {
      resolve(false);
      return;
    }

    canvas.width = 2;
    canvas.height = 2;
    let settled = false;
    const finish = (supported: boolean) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      signal.removeEventListener("abort", handleAbort);
      resolve(supported);
    };
    const handleAbort = () => finish(false);
    const timeout = window.setTimeout(() => finish(false), 500);
    signal.addEventListener("abort", handleAbort, { once: true });

    image.onload = () => {
      try {
        context.drawImage(image, 0, 0);
        const pixel = context.getImageData(1, 1, 1, 1).data;
        finish(Math.abs(pixel[0] - 18) <= 3 && Math.abs(pixel[1] - 63) <= 3 && Math.abs(pixel[2] - 39) <= 3 && pixel[3] > 0);
      } catch {
        finish(false);
      }
    };
    image.onerror = () => finish(false);
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="2" height="2"><foreignObject width="2" height="2"><div xmlns="http://www.w3.org/1999/xhtml" style="width:2px;height:2px;background:rgb(18,63,39)"></div></foreignObject></svg>';
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  });
}

function findRuntimeCanvas(glass: HTMLElement) {
  return Array.from(glass.children).find((child): child is HTMLCanvasElement => child.tagName === "CANVAS") ?? null;
}

export function useMobileLiquidGlass(
  rootRef: RefObject<HTMLElement | null>,
  glassRef: RefObject<HTMLDivElement | null>,
  enabled: boolean,
) {
  useEffect(() => {
    if (!enabled) return;

    const root = rootRef.current;
    const glass = glassRef.current;
    if (!root || !glass) {
      emitLiquidGlassDiagnostic("eligibility", { target_found: false });
      return;
    }
    recordTargetIdentity(glass);

    const mobileQuery = window.matchMedia(MOBILE_MEDIA_QUERY);
    const reducedMotionQuery = window.matchMedia(REDUCED_MOTION_QUERY);
    let cancelled = false;
    let initializing = false;
    let retryAfterCancellation = false;
    let instance: LiquidGlassInstance | null = null;
    let support: LiquidGlassSupport | null = null;
    let measurementRetry = 0;
    let pendingController: AbortController | null = null;
    let generation = 0;
    let lastInstanceMetrics: ReturnType<typeof measuredMetrics> | null = null;
    let initializationAllowed = false;
    let idleCallback = 0;
    let idleFallbackTimer = 0;

    const readSupport = () => (support ??= inspectLiquidGlassSupport());

    const destroyDetachedInstance = (detached: LiquidGlassInstance, reason: DestroyReason) => {
      detached.destroy();
      lifecycleCounters.destroy_calls += 1;
      emitLiquidGlassDiagnostic("destroyed", { destroyed_reason: reason });
    };

    const destroyActiveInstance = (reason: DestroyReason) => {
      if (!instance) return;
      const activeInstance = instance;
      instance = null;
      activeInstance.destroy();
      lifecycleCounters.destroy_calls += 1;
      lifecycleCounters.active_instance_count = Math.max(0, lifecycleCounters.active_instance_count - 1);
      root.dataset.liquidGlassState = "fallback";
      emitLiquidGlassDiagnostic("destroyed", { destroyed_reason: reason });
    };

    const cancelPendingInitialization = (retry: boolean) => {
      if (!pendingController) return;
      retryAfterCancellation ||= retry;
      generation += 1;
      pendingController.abort();
      pendingController = null;
    };

    const scheduleMeasurementRetry = () => {
      window.clearTimeout(measurementRetry);
      measurementRetry = window.setTimeout(() => {
        measurementRetry = 0;
        void synchronize();
      }, MEASUREMENT_RETRY_MS);
    };

    const synchronize = async () => {
      if (cancelled || !initializationAllowed || document.visibilityState !== "visible") return;

      const currentSupport = mobileQuery.matches
        ? readSupport()
        : { backdropFilterSupported: false, canvasSupported: false, webglSupported: false };
      const size = measuredSize(glass);
      emitLiquidGlassDiagnostic("eligibility", {
        backdrop_filter_supported: currentSupport.backdropFilterSupported,
        canvas_supported: currentSupport.canvasSupported,
        mobile_match: mobileQuery.matches,
        reduced_motion: reducedMotionQuery.matches,
        target_found: true,
        target_height: size.height,
        target_width: size.width,
        webgl_supported: currentSupport.webglSupported,
      });

      const supported = mobileQuery.matches
        && !reducedMotionQuery.matches
        && currentSupport.backdropFilterSupported
        && currentSupport.canvasSupported
        && currentSupport.webglSupported;
      if (!supported) {
        cancelPendingInitialization(false);
        destroyActiveInstance(reducedMotionQuery.matches ? "reduced_motion" : "unsupported");
        return;
      }

      if (instance) {
        const currentMetrics = measuredMetrics(glass);
        if (!metricsMatch(lastInstanceMetrics, currentMetrics)) {
          lastInstanceMetrics = currentMetrics;
          lifecycleCounters.resize_restarts += 1;
          instance.markChanged(root.firstElementChild instanceof HTMLElement ? root.firstElementChild : undefined);
        }
        return;
      }
      if (initializing) return;

      initializing = true;
      const controller = new AbortController();
      pendingController = controller;
      const attemptGeneration = ++generation;
      lifecycleCounters.init_attempts += 1;
      let failureReason: LiquidGlassDiagnostic["initialization_failed_reason"] = "dimensions_unavailable";
      try {
        await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
        if (controller.signal.aborted || attemptGeneration !== generation || cancelled) return;
        await document.fonts.ready;
        if (controller.signal.aborted || attemptGeneration !== generation || cancelled) return;

        const measured = measuredSize(glass);
        if (measured.width <= 0 || measured.height <= 0) {
          emitLiquidGlassDiagnostic("initialization_failed", {
            initialization_failed_reason: failureReason,
            target_height: measured.height,
            target_width: measured.width,
          });
          scheduleMeasurementRetry();
          return;
        }

        failureReason = "foreign_object_unsupported";
        const foreignObjectSupported = await inspectForeignObjectSupport(controller.signal);
        emitLiquidGlassDiagnostic("capture_support", { foreign_object_supported: foreignObjectSupported });
        if (controller.signal.aborted || attemptGeneration !== generation || cancelled) return;
        if (!foreignObjectSupported) {
          emitLiquidGlassDiagnostic("initialization_failed", { initialization_failed_reason: failureReason });
          return;
        }

        failureReason = "module_load_failed";
        const liquidGlassModule = await import("../vendor/liquidglass/index.js");
        if (controller.signal.aborted || attemptGeneration !== generation || cancelled) return;
        if (typeof liquidGlassModule.LiquidGlass?.init !== "function") {
          failureReason = "api_unavailable";
          throw new Error("LiquidGlass API unavailable");
        }

        failureReason = "initialization_exception";
        lifecycleCounters.capture_attempts += 1;
        const nextInstance = await liquidGlassModule.LiquidGlass.init({
          root,
          glassElements: [glass],
          defaults: {
            blurAmount: 0.1,
            refraction: 0.28,
            chromAberration: 0,
            edgeHighlight: 0.12,
            specular: 0.06,
            fresnel: 0.3,
            distortion: 0.012,
            cornerRadius: 28,
            zRadius: 16,
            opacity: 0.92,
            saturation: 0.06,
            tintStrength: 0,
            brightness: 0.02,
            shadowOpacity: 0.12,
            shadowSpread: 8,
            shadowOffsetY: 2,
            floating: false,
            button: false,
            bevelMode: 0,
          },
        });

        if (controller.signal.aborted || attemptGeneration !== generation || cancelled) {
          destroyDetachedInstance(nextInstance, "stale_initialization");
          return;
        }

        const runtimeCanvas = findRuntimeCanvas(glass);
        if (!runtimeCanvas || runtimeCanvas.width <= 0 || runtimeCanvas.height <= 0) {
          failureReason = "canvas_missing";
          destroyDetachedInstance(nextInstance, "unsupported");
          throw new Error("LiquidGlass canvas unavailable");
        }

        instance = nextInstance;
        lastInstanceMetrics = measuredMetrics(glass);
        pendingController = null;
        lifecycleCounters.successful_instances += 1;
        lifecycleCounters.active_instance_count += 1;
        root.dataset.liquidGlassState = "active";
        emitLiquidGlassDiagnostic("initialization_succeeded", {
          canvas_attached: true,
          target_height: measured.height,
          target_width: measured.width,
        });
      } catch {
        root.dataset.liquidGlassState = "fallback";
        emitLiquidGlassDiagnostic("initialization_failed", { initialization_failed_reason: failureReason });
      } finally {
        if (pendingController === controller) pendingController = null;
        initializing = false;
        if (retryAfterCancellation && !cancelled && document.visibilityState === "visible") {
          retryAfterCancellation = false;
          void synchronize();
        }
      }
    };

    const handleMediaChange = () => {
      support = null;
      void synchronize();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState !== "visible") {
        cancelPendingInitialization(true);
        return;
      }
      void synchronize();
    };

    const beginDeferredInitialization = () => {
      const start = () => {
        if (cancelled) return;
        initializationAllowed = true;
        void synchronize();
      };

      if (typeof window.requestIdleCallback === "function") {
        idleCallback = window.requestIdleCallback(start, { timeout: LIQUID_GLASS_IDLE_TIMEOUT_MS });
      } else {
        idleFallbackTimer = window.setTimeout(start, LIQUID_GLASS_FALLBACK_DELAY_MS);
      }
    };

    const handleWindowLoad = () => beginDeferredInitialization();

    root.dataset.liquidGlassState = "fallback";
    mobileQuery.addEventListener("change", handleMediaChange);
    reducedMotionQuery.addEventListener("change", handleMediaChange);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    if (document.readyState === "complete") beginDeferredInitialization();
    else window.addEventListener("load", handleWindowLoad, { once: true });

    return () => {
      cancelled = true;
      window.clearTimeout(measurementRetry);
      window.clearTimeout(idleFallbackTimer);
      if (idleCallback && typeof window.cancelIdleCallback === "function") window.cancelIdleCallback(idleCallback);
      cancelPendingInitialization(false);
      window.removeEventListener("load", handleWindowLoad);
      mobileQuery.removeEventListener("change", handleMediaChange);
      reducedMotionQuery.removeEventListener("change", handleMediaChange);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      destroyActiveInstance("unmount");
      delete root.dataset.liquidGlassState;
    };
  }, [enabled, glassRef, rootRef]);
}
