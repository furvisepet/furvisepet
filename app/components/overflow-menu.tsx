"use client";

import Link from "next/link";
import { createPortal } from "react-dom";
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";

const MENU_WIDTH = 176;
const MENU_GAP = 8;
const VIEWPORT_GUTTER = 12;

export type OverflowMenuItem =
  | { type: "separator" }
  | { disabled?: boolean; href?: string; label: string; onSelect?: () => void; tone?: "default" | "danger"; type: "item" };

export function OverflowMenu({ ariaLabel, dataUi = "overflow-menu", items }: { ariaLabel: string; dataUi?: string; items: OverflowMenuItem[] }) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ left: VIEWPORT_GUTTER, placement: "below", top: VIEWPORT_GUTTER });
  const menuId = useId();
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const placeMenu = useCallback((menuHeight = 120) => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const maxLeft = Math.max(VIEWPORT_GUTTER, window.innerWidth - MENU_WIDTH - VIEWPORT_GUTTER);
    const left = Math.min(Math.max(VIEWPORT_GUTTER, rect.right - MENU_WIDTH), maxLeft);
    const bottomNavigation = document.querySelector<HTMLElement>("[data-ui='mobile-bottom-navigation']");
    const navigationTop = bottomNavigation?.getClientRects().length ? bottomNavigation.getBoundingClientRect().top : window.innerHeight;
    const bottomBoundary = Math.min(window.innerHeight - VIEWPORT_GUTTER, navigationTop - VIEWPORT_GUTTER);
    const placement = bottomBoundary - rect.bottom >= menuHeight + MENU_GAP ? "below" : "above";
    const preferredTop = placement === "below" ? rect.bottom + MENU_GAP : rect.top - menuHeight - MENU_GAP;
    const maxTop = Math.max(VIEWPORT_GUTTER, bottomBoundary - menuHeight);
    setPosition({ left, placement, top: Math.min(Math.max(VIEWPORT_GUTTER, preferredTop), maxTop) });
  }, []);

  const closeMenu = useCallback((restoreFocus = false) => {
    setOpen(false);
    if (restoreFocus) requestAnimationFrame(() => triggerRef.current?.focus());
  }, []);

  const focusItem = useCallback((index: number) => {
    const menuItems = menuRef.current?.querySelectorAll<HTMLElement>("[role='menuitem']:not([aria-disabled='true'])");
    if (!menuItems?.length) return;
    menuItems[(index + menuItems.length) % menuItems.length]?.focus();
  }, []);

  useLayoutEffect(() => {
    if (open) placeMenu(menuRef.current?.getBoundingClientRect().height);
  }, [open, placeMenu]);

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (menuRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      closeMenu(true);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      closeMenu(true);
    };
    const handleViewportChange = () => placeMenu(menuRef.current?.getBoundingClientRect().height);
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", handleViewportChange);
    window.addEventListener("scroll", handleViewportChange, true);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", handleViewportChange);
      window.removeEventListener("scroll", handleViewportChange, true);
    };
  }, [closeMenu, open, placeMenu]);

  function handleMenuKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const menuItems = Array.from(event.currentTarget.querySelectorAll<HTMLElement>("[role='menuitem']:not([aria-disabled='true'])"));
    const currentIndex = menuItems.indexOf(document.activeElement as HTMLElement);
    if (event.key === "ArrowDown") {
      event.preventDefault();
      focusItem(currentIndex + 1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      focusItem(currentIndex - 1);
    } else if (event.key === "Home") {
      event.preventDefault();
      focusItem(0);
    } else if (event.key === "End") {
      event.preventDefault();
      focusItem(menuItems.length - 1);
    }
  }

  const menu = open ? (
    <div
      aria-label={ariaLabel}
      className="fixed z-[var(--z-popover)] w-44 max-w-[calc(100vw-1.5rem)] rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-overlay)] p-1.5 shadow-[var(--shadow-surface-2)]"
      data-placement={position.placement}
      data-ui={dataUi}
      id={menuId}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget) && event.relatedTarget !== triggerRef.current) closeMenu();
      }}
      onKeyDown={handleMenuKeyDown}
      ref={menuRef}
      role="menu"
      style={{ left: position.left, top: position.top }}
    >
      {items.map((item, index) => item.type === "separator" ? (
        <div className="my-1 border-t border-[var(--line)]" key={`separator-${index}`} role="separator" />
      ) : item.href ? (
        <Link className={menuItemClass(item.tone)} href={item.href} key={item.label} onClick={() => closeMenu()} role="menuitem" tabIndex={-1}>{item.label}</Link>
      ) : (
        <button
          aria-disabled={item.disabled || undefined}
          className={menuItemClass(item.tone)}
          disabled={item.disabled}
          key={item.label}
          onClick={() => { closeMenu(true); item.onSelect?.(); }}
          role="menuitem"
          tabIndex={-1}
          type="button"
        >
          {item.label}
        </button>
      ))}
    </div>
  ) : null;

  return (
    <>
      <button
        aria-controls={open ? menuId : undefined}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={ariaLabel}
        className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[var(--ghost-action-text)] transition-colors hover:bg-[var(--ghost-action-hover)] hover:text-[var(--text-primary)] active:bg-[var(--surface-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
        data-ui={`${dataUi}-trigger`}
        onClick={(event) => {
          placeMenu();
          if (open) return closeMenu(true);
          setOpen(true);
          if (event.detail === 0) requestAnimationFrame(() => focusItem(0));
        }}
        onKeyDown={(event) => {
          if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
          event.preventDefault();
          placeMenu();
          setOpen(true);
          requestAnimationFrame(() => focusItem(event.key === "ArrowUp" ? -1 : 0));
        }}
        ref={triggerRef}
        title={ariaLabel}
        type="button"
      >
        <svg aria-hidden="true" className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
          <circle cx="5" cy="12" r="1.75" /><circle cx="12" cy="12" r="1.75" /><circle cx="19" cy="12" r="1.75" />
        </svg>
      </button>
      {menu ? createPortal(menu, document.body) : null}
    </>
  );
}

function menuItemClass(tone: "default" | "danger" = "default") {
  return `flex min-h-11 w-full items-center rounded-[var(--radius-sm)] px-3 text-left text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] disabled:cursor-not-allowed disabled:text-[var(--disabled-text)] ${tone === "danger" ? "text-[var(--danger-text)] hover:bg-[var(--danger-surface)]" : "text-[var(--text-primary)] hover:bg-[var(--surface-hover)]"}`;
}
