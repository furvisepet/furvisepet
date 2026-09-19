export function observeCompactNavigation(onCompact: (compact: boolean) => void, viewport: Window = window, page: Document = document) {
    const media = viewport.matchMedia("(max-width: 1023px)");
    let timer: ReturnType<typeof setTimeout>;
    let previousY = viewport.scrollY;
    let lastInteraction = -Infinity;
    const interaction = () => { lastInteraction = Date.now(); };
    const keyInteraction = (event: KeyboardEvent) => { if (["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "].includes(event.key)) interaction(); };
    const keyboardInNavigation = () => page.activeElement?.matches('[data-ui="mobile-bottom-navigation"] :focus-visible');
    const scheduleIdle = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (media.matches && !keyboardInNavigation()) onCompact(true);
      }, 1800);
    };
    const scroll = () => {
      const nextY = Math.max(0, viewport.scrollY);
      if (Date.now() - lastInteraction > 350) { previousY = nextY; return; }
      if (media.matches && Math.abs(nextY - previousY) >= 8) {
        // Ignore layout-driven scroll events until another user input arrives.
        lastInteraction = -Infinity;
        onCompact(nextY > previousY && !keyboardInNavigation());
        previousY = nextY;
      }
      scheduleIdle();
    };
    const focus = () => {
      if (keyboardInNavigation()) { clearTimeout(timer); onCompact(false); }
      else scheduleIdle();
    };
    const resize = () => { onCompact(false); previousY = viewport.scrollY; scheduleIdle(); };
    scheduleIdle();
    viewport.addEventListener("scroll", scroll, { passive: true });
    viewport.addEventListener("wheel", interaction, { passive: true });
    viewport.addEventListener("touchmove", interaction, { passive: true });
    viewport.addEventListener("keydown", keyInteraction);
    page.addEventListener("focusin", focus);
    page.addEventListener("focusout", focus);
    media.addEventListener("change", resize);
    return () => {
      clearTimeout(timer);
      viewport.removeEventListener("scroll", scroll);
      viewport.removeEventListener("wheel", interaction);
      viewport.removeEventListener("touchmove", interaction);
      viewport.removeEventListener("keydown", keyInteraction);
      page.removeEventListener("focusin", focus);
      page.removeEventListener("focusout", focus);
      media.removeEventListener("change", resize);
    };
}
