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

type LiquidGlassDiagnostic = Partial<{
  backdrop_filter_supported: boolean;
  canvas_attached: boolean;
  canvas_supported: boolean;
  destroyed_reason: "hidden" | "resize" | "route_change" | "reduced_motion" | "unsupported" | "unmount";
  foreign_object_supported: boolean;
  initialization_failed_reason: "api_unavailable" | "canvas_missing" | "dimensions_unavailable" | "foreign_object_unsupported" | "initialization_exception" | "module_load_failed";
  initialization_started: boolean;
  initialization_succeeded: boolean;
  mobile_match: boolean;
  module_loaded: boolean;
  reduced_motion: boolean;
  target_found: boolean;
  target_height: number;
  target_width: number;
  webgl_supported: boolean;
}>;

const MOBILE_MEDIA_QUERY = "(max-width: 1023px)";
const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";
const RESIZE_RESTART_DELAY_MS = 180;
const MEASUREMENT_RETRY_MS = 100;

function emitLiquidGlassDiagnostic(event: string, diagnostic: LiquidGlassDiagnostic = {}) {
  if (process.env.NODE_ENV !== "development") return;
  console.debug("[Furvise LiquidGlass]", { event, ...diagnostic });
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

    // A canvas cannot switch context types after getContext succeeds.
    // WebGL capability must be tested on a separate canvas.
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
  return {
    height: Math.round(rect.height),
    width: Math.round(rect.width),
  };
}

function inspectForeignObjectSupport() {
  if (typeof SVGForeignObjectElement === "undefined") return Promise.resolve(false);

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
      resolve(supported);
    };
    const timeout = window.setTimeout(() => finish(false), 500);

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
  lifecycleKey: string,
) {
  useEffect(() => {
    if (!enabled) return;

    const root = rootRef.current;
    const glass = glassRef.current;
    if (!root || !glass) {
      emitLiquidGlassDiagnostic("eligibility", { target_found: false });
      return;
    }

    const mobileQuery = window.matchMedia(MOBILE_MEDIA_QUERY);
    const reducedMotionQuery = window.matchMedia(REDUCED_MOTION_QUERY);
    let cancelled = false;
    let initializing = false;
    let instance: LiquidGlassInstance | null = null;
    let support: LiquidGlassSupport | null = null;
    let measurementRetry = 0;
    let resizeRestart = 0;
    let restartRequested = false;
    let restartReason: LiquidGlassDiagnostic["destroyed_reason"] = "resize";

    const readSupport = () => (support ??= inspectLiquidGlassSupport());

    const eligibility = () => {
      const currentSupport = mobileQuery.matches
        ? readSupport()
        : { backdropFilterSupported: false, canvasSupported: false, webglSupported: false };
      return {
        eligible: !cancelled
          && mobileQuery.matches
          && !reducedMotionQuery.matches
          && document.visibilityState === "visible"
          && currentSupport.backdropFilterSupported
          && currentSupport.canvasSupported
          && currentSupport.webglSupported,
        support: currentSupport,
      };
    };

    const stop = (reason: LiquidGlassDiagnostic["destroyed_reason"]) => {
      const activeInstance = instance;
      instance = null;
      activeInstance?.destroy();
      root.dataset.liquidGlassState = "fallback";
      if (activeInstance) emitLiquidGlassDiagnostic("destroyed", { destroyed_reason: reason });
    };

    const scheduleMeasurementRetry = () => {
      window.clearTimeout(measurementRetry);
      measurementRetry = window.setTimeout(() => {
        measurementRetry = 0;
        void synchronize();
      }, MEASUREMENT_RETRY_MS);
    };

    const synchronize = async () => {
      const current = eligibility();
      const initialSize = measuredSize(glass);
      emitLiquidGlassDiagnostic("eligibility", {
        backdrop_filter_supported: current.support.backdropFilterSupported,
        canvas_supported: current.support.canvasSupported,
        mobile_match: mobileQuery.matches,
        reduced_motion: reducedMotionQuery.matches,
        target_found: true,
        target_height: initialSize.height,
        target_width: initialSize.width,
        webgl_supported: current.support.webglSupported,
      });

      if (!current.eligible) {
        const reason = document.visibilityState !== "visible"
          ? "hidden"
          : reducedMotionQuery.matches
            ? "reduced_motion"
            : "unsupported";
        stop(reason);
        return;
      }

      if (instance) {
        instance.markChanged(root.firstElementChild instanceof HTMLElement ? root.firstElementChild : undefined);
        return;
      }
      if (initializing) return;

      initializing = true;
      let failureReason: LiquidGlassDiagnostic["initialization_failed_reason"] = "module_load_failed";
      try {
        await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
        if (!eligibility().eligible) return;

        const size = measuredSize(glass);
        if (size.width <= 0 || size.height <= 0) {
          failureReason = "dimensions_unavailable";
          emitLiquidGlassDiagnostic("initialization_failed", {
            initialization_failed_reason: failureReason,
            target_height: size.height,
            target_width: size.width,
          });
          scheduleMeasurementRetry();
          return;
        }

        failureReason = "foreign_object_unsupported";
        const foreignObjectSupported = await inspectForeignObjectSupport();
        emitLiquidGlassDiagnostic("capture_support", { foreign_object_supported: foreignObjectSupported });
        if (!foreignObjectSupported) {
          emitLiquidGlassDiagnostic("initialization_failed", { initialization_failed_reason: failureReason });
          return;
        }
        if (!eligibility().eligible) return;

        const liquidGlassModule = await import("../vendor/liquidglass/index.js");
        emitLiquidGlassDiagnostic("module_loaded", { module_loaded: true });
        if (typeof liquidGlassModule.LiquidGlass?.init !== "function") {
          failureReason = "api_unavailable";
          throw new Error("LiquidGlass API unavailable");
        }

        failureReason = "initialization_exception";
        emitLiquidGlassDiagnostic("initialization_started", { initialization_started: true });
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

        if (!eligibility().eligible || cancelled) {
          nextInstance.destroy();
          return;
        }

        const runtimeCanvas = findRuntimeCanvas(glass);
        if (!runtimeCanvas || runtimeCanvas.width <= 0 || runtimeCanvas.height <= 0) {
          failureReason = "canvas_missing";
          nextInstance.destroy();
          throw new Error("LiquidGlass canvas unavailable");
        }

        instance = nextInstance;
        root.dataset.liquidGlassState = "active";
        emitLiquidGlassDiagnostic("initialization_succeeded", {
          canvas_attached: true,
          initialization_succeeded: true,
          target_height: size.height,
          target_width: size.width,
        });
      } catch {
        stop("unsupported");
        emitLiquidGlassDiagnostic("initialization_failed", { initialization_failed_reason: failureReason });
      } finally {
        initializing = false;
        if (restartRequested && !cancelled) {
          const reason = restartReason;
          restartRequested = false;
          stop(reason);
          void synchronize();
        }
      }
    };

    const requestRestart = (reason: LiquidGlassDiagnostic["destroyed_reason"]) => {
      restartReason = reason;
      if (initializing) {
        restartRequested = true;
        return;
      }
      stop(reason);
      void synchronize();
    };

    const handleEligibilityChange = () => {
      support = null;
      void synchronize();
    };

    const handleResize = () => {
      window.clearTimeout(resizeRestart);
      resizeRestart = window.setTimeout(() => requestRestart("resize"), RESIZE_RESTART_DELAY_MS);
    };

    root.dataset.liquidGlassState = "fallback";
    mobileQuery.addEventListener("change", handleEligibilityChange);
    reducedMotionQuery.addEventListener("change", handleEligibilityChange);
    document.addEventListener("visibilitychange", handleEligibilityChange);
    window.addEventListener("orientationchange", handleResize);
    window.addEventListener("resize", handleResize, { passive: true });
    void synchronize();

    return () => {
      cancelled = true;
      window.clearTimeout(measurementRetry);
      window.clearTimeout(resizeRestart);
      mobileQuery.removeEventListener("change", handleEligibilityChange);
      reducedMotionQuery.removeEventListener("change", handleEligibilityChange);
      document.removeEventListener("visibilitychange", handleEligibilityChange);
      window.removeEventListener("orientationchange", handleResize);
      window.removeEventListener("resize", handleResize);
      stop(lifecycleKey ? "route_change" : "unmount");
      delete root.dataset.liquidGlassState;
    };
  }, [enabled, glassRef, lifecycleKey, rootRef]);
}
