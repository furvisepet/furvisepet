"use client";

import { useEffect, useState } from "react";
import { observeCompactNavigation } from "./compact-navigation-observer";

export function useCompactNavigation(enabled: boolean) {
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    if (enabled) return observeCompactNavigation(setCompact);
  }, [enabled]);
  return enabled && compact;
}
