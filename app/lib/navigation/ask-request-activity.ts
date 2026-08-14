"use client";

import { useEffect, useState } from "react";

const EVENT_NAME = "furvise:ask-request-activity";
let active = false;

export function setAskRequestActive(next: boolean) {
  if (active === next) return;
  active = next;
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: next }));
}

export function isAskRequestActive() { return active; }

export function useAskRequestActive() {
  const [requestActive, setRequestActiveState] = useState(active);
  useEffect(() => {
    const synchronize = () => setRequestActiveState(active);
    synchronize();
    window.addEventListener(EVENT_NAME, synchronize);
    return () => window.removeEventListener(EVENT_NAME, synchronize);
  }, []);
  return requestActive;
}
