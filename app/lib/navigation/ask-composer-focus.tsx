"use client";

import { createContext, useContext, useMemo, useState } from "react";

type AskComposerFocusContextValue = {
  composerFocused: boolean;
  setComposerFocused: (focused: boolean) => void;
};

const AskComposerFocusContext = createContext<AskComposerFocusContextValue | null>(null);

export function AskComposerFocusProvider({ children }: { children: React.ReactNode }) {
  const [composerFocused, setComposerFocused] = useState(false);
  const value = useMemo(() => ({ composerFocused, setComposerFocused }), [composerFocused]);
  return <AskComposerFocusContext.Provider value={value}>{children}</AskComposerFocusContext.Provider>;
}

export function useAskComposerFocus() {
  const value = useContext(AskComposerFocusContext);
  if (!value) throw new Error("useAskComposerFocus must be used within AskComposerFocusProvider");
  return value;
}
