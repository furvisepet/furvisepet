"use client";

import { useSyncExternalStore } from "react";
import { getLocalGreeting, SERVER_SAFE_GREETING } from "../lib/today";

export function TodayGreeting() {
  const greeting = useSyncExternalStore(subscribe, getBrowserGreeting, getServerGreeting);
  return <>{greeting}</>;
}

function subscribe() {
  return () => {};
}

function getBrowserGreeting() {
  return getLocalGreeting(new Date().getHours());
}

function getServerGreeting() {
  return SERVER_SAFE_GREETING;
}
