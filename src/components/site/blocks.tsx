import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowRight, Camera, Plus } from "lucide-react";
import { Reveal } from "@/components/front/Reveal";

export function Section({ children, tone, id, className = "", reveal = true }: { children: ReactNode; tone?: "white" | "sky" | "deep"; id?: string; className?: string; reveal?: boolean }) {
  return (
    <section id={id} className={`x-section ${tone ?? ""} ${className}`}>
      <div className="x-container">{reveal ? <Reveal>{children}</Reveal> : children}</div>
    </section>
  );
}

export function Head({ eyebrow, title, lead, center, as: Tag = "h2" }: { eyebrow?: string; title: ReactNode; lead?: ReactNode; center?: boolean; as?: "h1" | "h2" }) {
  return (
    <div className={`x-head ${center ? "center" : ""}`}>
      {eyebrow && <span className="x-eyebrow">{eyebrow}</span>}
      <Tag className={Tag === "h1" ? "x-h1" : "x-h2"}>{title}</Tag>
      {lead && <p className="x-lead">{lead}</p>}
    </div>
  );
}

export function Btn({ href, children, variant = "primary", arrow, small }: { href: string; children: ReactNode; variant?: "primary" | "outline" | "light"; arrow?: boolean; small?: boolean }) {
  return (
    <Link href={href} className={`x-btn x-btn-${variant} ${small ? "x-btn-sm" : ""}`}>
      {children}
      {arrow && <ArrowRight size={18} className="arrow" aria-hidden="true" />}
    </Link>
  );
}

/** Art-directed placeholder for licensed South African photography. Replace with real images — see BRAND.md. */
export function PhotoSlot({ brief, shape = "blob", className = "", style }: { brief: string; shape?: "blob" | "rect"; className?: string; style?: React.CSSProperties }) {
  return (
    <figure className={`x-photo ${shape === "rect" ? "rect" : ""} ${className}`} style={style} role="img" aria-label={`Photography placeholder: ${brief}`}>
      <figcaption>
        <b><Camera size={13} aria-hidden="true" /> Photography to be commissioned</b>
        {brief}
      </figcaption>
    </figure>
  );
}

export function Faq({ items }: { items: readonly (readonly [string, string])[] }) {
  return (
    <div className="x-faq">
      {items.map(([q, a]) => (
        <details key={q}>
          <summary>
            {q}
            <Plus size={22} aria-hidden="true" />
          </summary>
          <p>{a}</p>
        </details>
      ))}
    </div>
  );
}

export function CtaBand({ title, lead, primary, secondary }: { title: ReactNode; lead: ReactNode; primary: { href: string; label: string }; secondary?: { href: string; label: string } }) {
  return (
    <section className="x-section" style={{ paddingTop: 0 }}>
      <div className="x-container">
        <div className="x-cta">
          <div className="x-stack" style={{ ["--gap" as string]: "16px" }}>
            <h2 className="x-h2">{title}</h2>
            <p className="x-lead">{lead}</p>
          </div>
          <div className="x-btn-row" style={{ justifyContent: "flex-start" }}>
            <Btn href={primary.href} variant="light" arrow>{primary.label}</Btn>
            {secondary && <Link href={secondary.href} className="x-btn x-btn-outline" style={{ background: "transparent", color: "#fff", borderColor: "rgba(255,255,255,.6)" }}>{secondary.label}</Link>}
          </div>
        </div>
      </div>
    </section>
  );
}

export function FeatureList({ items }: { items: readonly { icon: ReactNode; title: string; text: string }[] }) {
  return (
    <ul className="x-list">
      {items.map((i) => (
        <li key={i.title}>
          <span className="x-icon round" style={{ width: 44, height: 44 }}>{i.icon}</span>
          <div>
            <strong>{i.title}</strong>
            <span>{i.text}</span>
          </div>
        </li>
      ))}
    </ul>
  );
}

export function PageHero({ eyebrow, title, lead, actions, aside }: { eyebrow: string; title: ReactNode; lead: ReactNode; actions?: ReactNode; aside?: ReactNode }) {
  return (
    <section className="x-hero" style={{ paddingBottom: "clamp(48px,7vw,96px)" }}>
      <div className="x-blob a" style={{ width: 620, height: 560, right: -180, top: -120 }} aria-hidden="true" />
      <div className="x-blob b" style={{ width: 360, height: 320, left: -120, bottom: -60 }} aria-hidden="true" />
      <div className="x-container">
        <div className={aside ? "x-split" : ""} style={{ position: "relative", zIndex: 1 }}>
          <div className="x-stack" style={{ ["--gap" as string]: "22px" }}>
            <span className="x-eyebrow x-rise">{eyebrow}</span>
            <h1 className="x-h1 x-rise d1">{title}</h1>
            <p className="x-lead x-rise d2">{lead}</p>
            {actions && <div className="x-btn-row x-rise d3">{actions}</div>}
          </div>
          {aside && <div className="x-rise d2">{aside}</div>}
        </div>
      </div>
    </section>
  );
}
