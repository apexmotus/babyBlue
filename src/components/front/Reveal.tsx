import type { CSSProperties, ReactNode } from "react";

/**
 * Marks a block for the scroll reveal. It only emits a `data-rv` attribute (and an optional stagger delay); all behaviour
 * lives in the single <RevealController /> mounted once in the layout. The block is fully visible in the server HTML, so
 * without JavaScript, or under prefers-reduced-motion, nothing is ever hidden.
 */
export function Reveal({ children, className = "", delay = 0, as: Tag = "div" }: { children: ReactNode; className?: string; delay?: number; as?: "div" | "li" | "section" | "article" }) {
  return (
    <Tag className={className} data-rv="" style={delay ? ({ "--d": `${delay}ms` } as CSSProperties) : undefined}>
      {children}
    </Tag>
  );
}
