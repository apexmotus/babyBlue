"use client";

import { useEffect } from "react";

/**
 * One controller for every <Reveal> on the page. After hydration it hides only the blocks that start below the fold and
 * reveals each once as it nears the viewport. A scroll check (not IntersectionObserver) is used on purpose: an observer
 * never fires for a block that is jumped over between frames (anchor links, fast scrolls), which would leave it hidden.
 */
export function RevealController() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const line = () => window.innerHeight * 0.92;
    const pending = new Set<HTMLElement>();
    let frame = 0;

    const detach = () => {
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
    const check = () => {
      frame = 0;
      const limit = line();
      const due = [...pending].filter((el) => el.getBoundingClientRect().top < limit);
      for (const el of due) {
        el.dataset.reveal = "in";
        pending.delete(el);
      }
      if (pending.size === 0) detach();
    };
    function schedule() {
      if (!frame) frame = requestAnimationFrame(check);
    }

    const limit = line();
    const below = [...document.querySelectorAll<HTMLElement>("[data-rv]")].filter((el) => el.getBoundingClientRect().top >= limit);
    for (const el of below) {
      el.dataset.reveal = "pending";
      pending.add(el);
    }
    if (pending.size > 0) {
      window.addEventListener("scroll", schedule, { passive: true });
      window.addEventListener("resize", schedule);
      schedule();
    }
    return () => {
      detach();
      if (frame) cancelAnimationFrame(frame);
      for (const el of pending) delete el.dataset.reveal;
    };
  }, []);
  return null;
}
