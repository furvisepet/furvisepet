"use client";

import { useLayoutEffect } from "react";
import { readStoredAppearance, syncAppearanceToDocument } from "../lib/appearance";

export function ThemeBootstrap() {
  useLayoutEffect(() => {
    const { mode } = readStoredAppearance();
    syncAppearanceToDocument(mode);
  }, []);

  return null;
}
