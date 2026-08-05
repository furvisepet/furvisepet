"use client";

import { useEffect, type RefObject } from "react";

type LiquidGlassInstance = {
  destroy: () => void;
};

const MOBILE_MEDIA_QUERY = "(max-width: 1023px)";
const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

function supportsLiquidGlass() {
  if (
    typeof CSS === "undefined"
    || !(
      CSS.supports("backdrop-filter", "blur(1px)")
      || CSS.supports("-webkit-backdrop-filter", "blur(1px)")
    )
  ) {
    return false;
  }

  try {
    const canvas = document.createElement("canvas");
    if (!canvas.getContext("2d")) return false;
    const webgl = canvas.getContext("webgl");
    if (!webgl) return false;
    webgl.getExtension("WEBGL_lose_context")?.loseContext();
    return true;
  } catch {
    return false;
  }
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
    if (!root || !glass) return;

    const mobileQuery = window.matchMedia(MOBILE_MEDIA_QUERY);
    const reducedMotionQuery = window.matchMedia(REDUCED_MOTION_QUERY);
    let cancelled = false;
    let capable: boolean | null = null;
    let initializing = false;
    let instance: LiquidGlassInstance | null = null;

    const isEligible = () => (
      !cancelled
      && mobileQuery.matches
      && !reducedMotionQuery.matches
      && document.visibilityState === "visible"
      && (capable ??= supportsLiquidGlass())
    );

    const stop = () => {
      instance?.destroy();
      instance = null;
      root.dataset.liquidGlassState = "fallback";
    };

    const synchronize = async () => {
      if (!isEligible()) {
        stop();
        return;
      }
      if (instance || initializing) return;

      initializing = true;
      try {
        const { LiquidGlass } = await import("../vendor/liquidglass/index.js");
        if (!isEligible()) return;

        const nextInstance = await LiquidGlass.init({
          root,
          glassElements: [glass],
          defaults: {
            blurAmount: 0.14,
            refraction: 0.2,
            chromAberration: 0,
            edgeHighlight: 0.08,
            specular: 0.04,
            fresnel: 0.24,
            distortion: 0,
            cornerRadius: 28,
            zRadius: 16,
            opacity: 0.9,
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

        if (!isEligible()) {
          nextInstance.destroy();
          return;
        }
        instance = nextInstance;
        root.dataset.liquidGlassState = "active";
      } catch {
        stop();
      } finally {
        initializing = false;
      }
    };

    const handleEligibilityChange = () => {
      void synchronize();
    };

    root.dataset.liquidGlassState = "fallback";
    mobileQuery.addEventListener("change", handleEligibilityChange);
    reducedMotionQuery.addEventListener("change", handleEligibilityChange);
    document.addEventListener("visibilitychange", handleEligibilityChange);
    void synchronize();

    return () => {
      cancelled = true;
      mobileQuery.removeEventListener("change", handleEligibilityChange);
      reducedMotionQuery.removeEventListener("change", handleEligibilityChange);
      document.removeEventListener("visibilitychange", handleEligibilityChange);
      instance?.destroy();
      delete root.dataset.liquidGlassState;
    };
  }, [enabled, glassRef, rootRef]);
}
