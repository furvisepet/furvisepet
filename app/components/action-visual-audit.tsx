"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

export const ACTION_AUDIT_ROUTES = new Map([
  ["/", "Homepage"],
  ["/dashboard", "Today"],
  ["/pets", "Pets"],
  ["/care-log", "History"],
  ["/ask", "Ask"],
  ["/shop", "Products"],
]);

const SHARED_VARIANTS = new Set(["primary", "secondary", "soft", "ghost"]);
const COLOR_UTILITY = /^(?:text-(?:white|black|transparent|current)|text-\[(?:color:)?var\(--[^)]+\)\])$/;
const DISABLED_UTILITY = /^(?:bg-\[(?:color:)?var\(--(?:disabled|pw-disabled)[^)]+\)\]|text-\[(?:color:)?var\(--(?:disabled|pw-disabled)[^)]+\)\])$/;

function isVisible(element: HTMLElement) {
  const style = getComputedStyle(element);
  return style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity) > 0 && element.getClientRects().length > 0;
}

function visibleText(element: HTMLElement) {
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  let text = "";
  while (walker.nextNode()) {
    const parent = walker.currentNode.parentElement;
    if (parent && isVisible(parent)) text += ` ${walker.currentNode.textContent || ""}`;
  }
  return text.replace(/\s+/g, " ").trim();
}

function foregroundUtilities(element: HTMLElement) {
  const utilities = new Set<string>();
  for (const target of [element, ...element.querySelectorAll<HTMLElement>("[class]")]) {
    for (const token of target.classList) {
      if (!token.includes(":") && COLOR_UTILITY.test(token)) {
        const semanticToken = token.match(/var\(--([^)]+)\)/)?.[1] || token;
        utilities.add(semanticToken);
      }
    }
  }
  return utilities;
}

function recognizedVariant(element: HTMLElement) {
  const shared = element.dataset.buttonVariant;
  if (shared && SHARED_VARIANTS.has(shared)) return shared;
  if (element.dataset.chipVariant) return `chip:${element.dataset.chipVariant}`;
  if (element.dataset.ui) return `special:${element.dataset.ui}`;
  if (element.closest("nav")) return "navigation";
  if (element.tagName === "SUMMARY") return "navigation";
  if (element.getAttribute("role") === "menuitem") return "menu";

  const classes = element.className;
  if (classes.includes("bg-[var(--action-primary)]") || classes.includes("bg-[var(--pw-primary)]")) return "primary";
  if (classes.includes("bg-[var(--secondary-action)]")) return "secondary";
  if (classes.includes("bg-[var(--soft-action)]")) return "soft";
  if (classes.includes("rounded-full") && (classes.includes("border") || classes.includes("bg-transparent"))) return "soft";
  if (classes.includes("text-left") || classes.includes("w-full")) return "content-action";
  if (element.getAttribute("aria-label")) return "icon-action";
  return "";
}

function auditVisibleActions(routeName: string) {
  const controls = [...document.querySelectorAll<HTMLElement>("button, summary, a.rounded-full, a[data-button-variant], a[data-ui], a[role='button']")].filter(isVisible);
  const failures: string[] = [];

  controls.forEach((element, index) => {
    const text = visibleText(element);
    const accessibleName = (element.getAttribute("aria-label") || text || element.getAttribute("title") || "").trim();
    const iconOnly = !text && Boolean(element.getAttribute("aria-label"));
    const variant = recognizedVariant(element);
    const foregrounds = foregroundUtilities(element);
    const disabled = element.matches(":disabled") || element.getAttribute("aria-disabled") === "true";
    const enabledDisabledUtilities = [...element.classList].filter((token) => !token.includes(":") && DISABLED_UTILITY.test(token));
    const label = accessibleName || `${element.tagName.toLowerCase()} ${index + 1}`;

    if (!accessibleName) failures.push(`${label}: empty accessible name`);
    if (!text && !iconOnly) failures.push(`${label}: no visible text and no intentional icon-only label`);
    if (!variant) failures.push(`${label}: no recognized shared or semantic action variant`);
    if (foregrounds.size > 1) failures.push(`${label}: conflicting foreground utilities (${[...foregrounds].join(", ")})`);
    if (!disabled && enabledDisabledUtilities.length) failures.push(`${label}: enabled control uses disabled styling`);
    if (disabled && !text && !iconOnly) failures.push(`${label}: disabled label is not visible`);
  });

  console.assert(failures.length === 0, `[Furvise action audit] ${routeName}:\n${failures.join("\n")}`);
}

export function ActionVisualAudit() {
  const pathname = usePathname();

  useEffect(() => {
    const routeName = ACTION_AUDIT_ROUTES.get(pathname);
    if (!routeName) return;

    let frame = 0;
    let previousSignature = "";
    const run = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const signature = document.body.innerText;
        if (signature === previousSignature) return;
        previousSignature = signature;
        auditVisibleActions(routeName);
      });
    };
    const observer = new MutationObserver(run);
    observer.observe(document.body, { childList: true, subtree: true });
    run();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [pathname]);

  return null;
}
