"use client";

import Link from "next/link";
import { createPortal } from "react-dom";
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";

const MENU_WIDTH = 176;
const MENU_GAP = 8;
const VIEWPORT_GUTTER = 12;

type MenuPlacement = "above" | "below";
type MenuPosition = { left: number; placement: MenuPlacement; top: number };

export function PetOverflowMenu({
  editHref,
  name,
  notesHref,
  onDelete,
}: {
  editHref: string;
  name: string;
  notesHref: string;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<MenuPosition>({ left: VIEWPORT_GUTTER, placement: "below", top: VIEWPORT_GUTTER });
  const menuId = useId();
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const placeMenu = useCallback((menuHeight = 144) => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const maxLeft = Math.max(VIEWPORT_GUTTER, window.innerWidth - MENU_WIDTH - VIEWPORT_GUTTER);
    const left = Math.min(Math.max(VIEWPORT_GUTTER, rect.right - MENU_WIDTH), maxLeft);
    const bottomNavigation = document.querySelector<HTMLElement>("[data-ui='mobile-bottom-navigation']");
    const navigationTop = bottomNavigation?.getClientRects().length
      ? bottomNavigation.getBoundingClientRect().top
      : window.innerHeight;
    const bottomBoundary = Math.min(window.innerHeight - VIEWPORT_GUTTER, navigationTop - VIEWPORT_GUTTER);
    const roomBelow = bottomBoundary - rect.bottom;
    const placement: MenuPlacement = roomBelow >= menuHeight + MENU_GAP ? "below" : "above";
    const preferredTop = placement === "below" ? rect.bottom + MENU_GAP : rect.top - menuHeight - MENU_GAP;
    const maxTop = Math.max(VIEWPORT_GUTTER, bottomBoundary - menuHeight);
    const top = Math.min(Math.max(VIEWPORT_GUTTER, preferredTop), maxTop);
    setPosition({ left, placement, top });
  }, []);

  const closeMenu = useCallback((restoreFocus = false) => {
    setOpen(false);
    if (restoreFocus) requestAnimationFrame(() => triggerRef.current?.focus());
  }, []);

  const focusItem = useCallback((index: number) => {
    const items = menuRef.current?.querySelectorAll<HTMLElement>("[role='menuitem']");
    if (!items?.length) return;
    items[(index + items.length) % items.length]?.focus();
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    placeMenu(menuRef.current?.getBoundingClientRect().height);
  }, [open, placeMenu]);

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (menuRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      closeMenu();
    }

    function handleEscape(event: globalThis.KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      closeMenu(true);
    }

    function handleViewportChange() {
      placeMenu(menuRef.current?.getBoundingClientRect().height);
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);
    window.addEventListener("resize", handleViewportChange);
    window.addEventListener("scroll", handleViewportChange, true);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
      window.removeEventListener("resize", handleViewportChange);
      window.removeEventListener("scroll", handleViewportChange, true);
    };
  }, [closeMenu, open, placeMenu]);

  function handleMenuKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const items = Array.from(event.currentTarget.querySelectorAll<HTMLElement>("[role='menuitem']"));
    const currentIndex = items.indexOf(document.activeElement as HTMLElement);
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
      focusItem(items.length - 1);
    }
  }

  const menu = open ? (
    <div
      aria-label={`More actions for ${name}`}
      className="fixed z-[var(--z-popover)] w-44 max-w-[calc(100vw-1.5rem)] rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-overlay)] p-1.5 shadow-[var(--shadow-surface-2)]"
      data-placement={position.placement}
      data-ui="pet-overflow-menu"
      id={menuId}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget) && event.relatedTarget !== triggerRef.current) closeMenu();
      }}
      onKeyDown={handleMenuKeyDown}
      ref={menuRef}
      role="menu"
      style={{ left: position.left, top: position.top }}
    >
      <Link className={menuItemClass} href={editHref} onClick={() => closeMenu()} role="menuitem" tabIndex={-1}>Edit profile</Link>
      <Link className={menuItemClass} href={notesHref} onClick={() => closeMenu()} role="menuitem" tabIndex={-1}>Remembered details</Link>
      <div className="my-1 border-t border-[var(--line)]" role="separator" />
      <button
        className={`${menuItemClass} text-[var(--danger-text)] hover:bg-[var(--danger-surface)]`}
        onClick={() => {
          closeMenu(true);
          onDelete();
        }}
        role="menuitem"
        tabIndex={-1}
        type="button"
      >
        Delete profile
      </button>
    </div>
  ) : null;

  return (
    <>
      <button
        aria-controls={open ? menuId : undefined}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={`More actions for ${name}`}
        className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[var(--ghost-action-text)] transition-colors hover:bg-[var(--ghost-action-hover)] hover:text-[var(--text-primary)] active:bg-[var(--surface-hover)] focus-visible:outline-none"
        data-ui="pet-overflow-trigger"
        onClick={(event) => {
          placeMenu();
          if (open) {
            closeMenu(true);
            return;
          }
          setOpen(true);
          if (event.detail === 0) requestAnimationFrame(() => focusItem(0));
        }}
        onKeyDown={(event) => {
          if (event.key !== "ArrowDown") return;
          event.preventDefault();
          placeMenu();
          setOpen(true);
          requestAnimationFrame(() => focusItem(0));
        }}
        ref={triggerRef}
        title={`More actions for ${name}`}
        type="button"
      >
        <OverflowMenuIcon />
      </button>
      {menu ? createPortal(menu, document.body) : null}
    </>
  );
}

const menuItemClass = "flex min-h-11 w-full items-center rounded-[var(--radius-sm)] px-3 text-left text-sm font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-hover)] focus-visible:outline-none";

// Consolidates the existing three-circle overflow glyph previously embedded in the pet card.
function OverflowMenuIcon() {
  return (
    <svg aria-hidden="true" className="h-5 w-5" fill="none" viewBox="0 0 24 24">
      <circle cx="6" cy="12" fill="currentColor" r="1.5" />
      <circle cx="12" cy="12" fill="currentColor" r="1.5" />
      <circle cx="18" cy="12" fill="currentColor" r="1.5" />
    </svg>
  );
}
