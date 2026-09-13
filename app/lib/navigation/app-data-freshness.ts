"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "furvise:app-data-version";
const CHANGE_EVENT = "furvise:app-data-changed";

export function markAppDataChanged() {
  if (typeof window === "undefined") return;
  const next = readAppDataVersion() + 1;
  window.sessionStorage.setItem(STORAGE_KEY, String(next));
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: next }));
}

export function useAppDataVersion() {
  const [version, setVersion] = useState(readAppDataVersion);
  useEffect(() => {
    const synchronize = () => setVersion(readAppDataVersion());
    synchronize();
    window.addEventListener(CHANGE_EVENT, synchronize);
    return () => window.removeEventListener(CHANGE_EVENT, synchronize);
  }, []);
  return version;
}

export function readAppDataVersion() {
  if (typeof window === "undefined") return 0;
  const value = Number.parseInt(window.sessionStorage.getItem(STORAGE_KEY) || "0", 10);
  return Number.isSafeInteger(value) && value >= 0 ? value : 0;
}
